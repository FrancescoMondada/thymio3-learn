# Thymio 3 - the obstacle-avoidance mode that LEARNS (white body, "neural network"), in MicroPython.
#
# A port of main/ann.c of the Thymio 3 firmware, so that the robot behaves like the built-in white
# mode, but with its weights in the open: the firmware keeps them in C variables that nothing can
# read, this module prints them and lets the web interface change them.
#
# The network has no hidden layer: the 7 proximity sensors (5 in front, 2 behind) and a constant
# "bias" input each reach the two wheels through one weight, 16 weights in all.
#
#     x[i] = proximity[i] / 20,   x[7] = 1 (the bias)
#     wheel = (x[0]*w[0] + ... + x[6]*w[6] + x[7]*w[7]) / 30
#
# The bias weight of a wheel is its speed when nothing is in front of the robot (2000 / 30 = 66); the two can differ.
# The robot drives; when a front sensor goes over COLLISION it has hit something: it backs up for
# a second, and then learns, once, from the sensors that were over the threshold: on the left side
# the left wheel is pushed up and the right wheel down, so that next time the same reading makes the
# robot turn away; on the right the opposite; in the middle one wheel is slowed by half a step, on
# the side that was less close. Every 16 s every weight (but the bias) loses 1, towards 0: forgetting.
#
#   state 0  drive      the network drives, a collision is looked for         (white pulse)
#   state 1  back       backs up for 1 s after a collision                    (red)
#   state 2  learn      stopped for 0.3 s, the weights have just changed      (green)
#   state 4  freeze     the network drives, nothing is learnt                 (half yellow)
#   state 5  pause      stopped
#
# Buttons: backward = pause, forward = resume, left or right = freeze / learn again, centre = leave.
#
# Differences with the firmware: the learning step, the speed, the forgetting delay and the weights
# can be set (from the interface); a weight stops at 0 when it forgets (the firmware's step of 1
# makes a weight of 0.5 swing between +0.5 and -0.5 for ever); weights are limited to +-100; the
# motors are given again at every tick (a Bluetooth command from the interface sets them to 0 for a
# moment, see rx_poll) and limited to +-500.
#
# The interface and the robot talk through stdout and the four body LEDs:
#   robot -> interface  "@@word ..." lines, see say(). Every 100 ms: @@n state p0..p6 left right learnt learning (1 = learns, 0 = frozen, also while paused).
#                       When something changes (and every 3 s): @@w wl0..wl6 wr0..wr6 (tenths),
#                       @@p step baseLeft baseRight forgetSeconds (tenths, tenths, tenths, s).
#   interface -> robot  rx_poll() below.
import thymio
import time

# written by the interface when the whole mode is sent instead of the module (see run())
STEP10 = 30
BASE10 = 667
FORGET_S = 16
WEIGHTS = ""

# ---- constants of the firmware ---------------------------------------------
TICK_MS = 20            # the behaviors run at 50 Hz
NET_TICKS = 5           # the network is computed every 100 ms
COLLISION = 3300        # COLLISION_SENSOR_VALUE
SENSOR_SCALE = 20.0
MOTOR_SCALE = 30.0
BIAS = 2000.0           # the bias weight of both wheels: 2000 / 30 = 66.7
BACK_SPEED = -200
BACK_MS = 1000
LEARN_MS = 300
W_LIMIT = 100.0
MAX_SPEED = 500
MAXB = 16               # MAX_BRIGHTNESS
SND_COLLISION = 50      # TONE_TYPE_NOTIFY
SND_LEARN = 3           # TONE_TYPE_BEEP
HEARTBEAT_TICKS = 150   # the weights and the settings are said again every 3 s

ST_DRIVE = 0
ST_BACK = 1
ST_LEARN = 2
ST_FREEZE = 4
ST_PAUSE = 5
STATE_NAMES = {0: "drive", 1: "back", 2: "learn", 4: "freeze", 5: "pause"}

# commands (item 19)
CMD_RESET = 1
CMD_PAUSE = 2
CMD_RESUME = 3
CMD_FREEZE = 4
CMD_LEARN = 5
CMD_QUIT = 6
CMD_REPORT = 7

# ---- hardware ---------------------------------------------------------------
beh = thymio.BEHAVIORS()
mot = thymio.MOTORS()
btn = thymio.BUTTONS()
snd = thymio.SOUND()
rgb = [thymio.LEDS_RGB(i) for i in range(4)]            # FL, FR, BL, BR
circle = [thymio.LEDS_CIRCLE(i) for i in range(8)]
lego_f = [thymio.LEDS_LEGO_FRONT(i) for i in range(8)]
lego_b = [thymio.LEDS_LEGO_BACK(i) for i in range(8)]
prox = [thymio.PROXIMITY(i) for i in range(7)]


def say(*parts):
    # The firmware sends stdout in batches: at 100 bytes, or after a second without output. A line
    # padded to 100 bytes goes out at once, ended by \x1e (record separator) instead of a newline
    # that would only follow in the next batch.
    s = "@@" + " ".join([str(p) for p in parts])
    print(s + " " * (99 - len(s)) + "\x1e", end="")


def set_body(r, g, b):
    # (the green channel of the front left LED is where the interface's messages are told from
    # the mode's own lights: it never shows 15, see rx_poll)
    rgb[0].set_intensity(r, g if g != 15 else 14, b)
    rgb[1].set_intensity(r, g, b)
    rgb[2].set_intensity(r, g, b)
    rgb[3].set_intensity(r, g, b)


def lego_progress(n):
    # Leds_SetLegoProgress: the front row fills from the right, then the back row
    if n > 16:
        n = 16
    nf = n if n < 8 else 8
    nb = n - 8 if n > 8 else 0
    for i in range(8):
        lego_f[i].intensity(MAXB if i >= 8 - nf else 0)
        lego_b[i].intensity(MAXB if i >= 8 - nb else 0)


def play_sound(sound_id):
    try:
        snd.stop()
    except Exception:
        pass
    try:
        snd.play_onboard(sound_id)
    except Exception:
        pass


def clamp_w(v):
    if v > W_LIMIT:
        return W_LIMIT
    if v < -W_LIMIT:
        return -W_LIMIT
    return v


def tenths(v):
    # a number of tenths, rounded away from zero like a person would
    return int(v * 10 + 0.5) if v >= 0 else -int(-v * 10 + 0.5)


def led16(v):
    v = int(v)
    return 16 if v > 16 else v


class Edge:
    # true once, on the rising edge of the condition
    def __init__(self):
        self.prev = 0

    def __call__(self, cond):
        c = 1 if cond else 0
        r = c and not self.prev
        self.prev = c
        return r


def bias_of(base10):
    # the bias weight that gives a wheel this speed (in tenths) with nothing in front: speed * 30
    return BIAS if base10 == 667 else base10 * 3.0


class Brain:
    def __init__(self, step10, base10, forget_s, weights, base10r=None):
        self.lr = step10 / 10.0
        self.forget_ms = forget_s * 1000
        self.wl = [0.0] * 8
        self.wr = [0.0] * 8
        self.wl[7] = bias_of(base10)
        self.wr[7] = bias_of(base10 if base10r is None else base10r)
        if weights:
            v = weights.split(",")
            for i in range(7):
                if len(v) > i + 7:
                    self.wl[i] = clamp_w(int(v[i]) / 10.0)
                    self.wr[i] = clamp_w(int(v[i + 7]) / 10.0)
        self.state = ST_DRIVE
        self.prev_state = ST_DRIVE
        self.timer = 0
        self.forget_timer = 0
        self.learnt = 0
        self.collision = [0] * 7
        self.ml = 0
        self.mr = 0
        self.ticks = 0
        self.quit = False
        self.pulse = 0
        self.dirty = True           # the circle and the Lego LEDs are to be drawn
        self.beat = 0
        self.p = [0] * 7
        # messages of the interface (see rx_poll)
        self.rx_msg = -1
        self.rx_got = {}
        self.rx_last = -1
        self.e_back = Edge()
        self.e_fwd = Edge()
        self.e_side = Edge()
        self.e_center = Edge()

    # ---- the network ----------------------------------------------------------------------------
    def compute(self):
        l = 0.0
        r = 0.0
        for i in range(7):
            x = self.p[i] / SENSOR_SCALE
            l += x * self.wl[i]
            r += x * self.wr[i]
        l += self.wl[7]
        r += self.wr[7]
        l = l / MOTOR_SCALE
        r = r / MOTOR_SCALE
        self.ml = MAX_SPEED if l > MAX_SPEED else -MAX_SPEED if l < -MAX_SPEED else int(l)
        self.mr = MAX_SPEED if r > MAX_SPEED else -MAX_SPEED if r < -MAX_SPEED else int(r)

    def stop(self):
        self.ml = 0
        self.mr = 0

    # ---- reports --------------------------------------------------------------------------------
    def report_weights(self):
        say("w", *[tenths(self.wl[i]) for i in range(7)] + [tenths(self.wr[i]) for i in range(7)])

    def report_params(self):
        say("p", tenths(self.lr), tenths(self.wl[7] / MOTOR_SCALE), tenths(self.wr[7] / MOTOR_SCALE), self.forget_ms // 1000)

    def report_all(self):
        self.report_weights()
        self.report_params()
        self.beat = 0

    def set_state(self, state):
        if state != self.state:
            self.state = state
            say("state", STATE_NAMES[state])

    # ---- learning (the end of state 1) ---------------------------------------------------------------
    def learn(self):
        if self.learnt < 16:
            self.learnt += 1
        lr = self.lr
        half = lr / 2.0
        for i in range(7):
            if self.collision[i] >= 1:
                if i <= 1:                  # left, front left: turn right
                    self.wl[i] = clamp_w(self.wl[i] + lr)
                    self.wr[i] = clamp_w(self.wr[i] - lr)
                elif i == 3 or i == 4:      # front right, right: turn left
                    self.wr[i] = clamp_w(self.wr[i] + lr)
                    self.wl[i] = clamp_w(self.wl[i] - lr)
                elif i == 2:                # front: slow the wheel on the side that was less close
                    if self.collision[i] == 1:
                        self.wr[i] = clamp_w(self.wr[i] - half)
                    else:
                        self.wl[i] = clamp_w(self.wl[i] - half)
        self.collision = [0] * 7
        self.dirty = True
        say("learn", self.learnt)
        self.report_weights()

    def forget(self):
        for w in (self.wl, self.wr):
            for i in range(7):
                if w[i] > 0:
                    w[i] = w[i] - 1 if w[i] > 1 else 0.0
                elif w[i] < 0:
                    w[i] = w[i] + 1 if w[i] < -1 else 0.0
        if self.learnt > 0:
            self.learnt -= 1
        self.dirty = True
        say("forget", self.learnt)
        self.report_weights()

    def reset(self):
        for i in range(7):
            self.wl[i] = 0.0
            self.wr[i] = 0.0
        self.learnt = 0
        self.forget_timer = 0
        self.collision = [0] * 7
        self.dirty = True
        self.report_weights()

    # ---- the interface's messages --------------------------------------------------------------------
    def command(self, code):
        if code == CMD_RESET:
            self.reset()
        elif code == CMD_PAUSE:
            self.pause()
        elif code == CMD_RESUME:
            self.resume()
        elif code == CMD_FREEZE:
            if self.state != ST_PAUSE:
                self.collision = [0] * 7
                self.set_state(ST_FREEZE)
            self.prev_state = ST_FREEZE
        elif code == CMD_LEARN:
            if self.state != ST_PAUSE:
                self.collision = [0] * 7
                self.set_state(ST_DRIVE)
            self.prev_state = ST_DRIVE
        elif code == CMD_QUIT:
            say("exit")
            self.quit = True

    def item(self, key, v):
        if key < 7:
            self.wl[key] = clamp_w(v / 10.0)
        elif key < 14:
            self.wr[key - 7] = clamp_w(v / 10.0)
        elif key == 14:
            self.wl[7] = bias_of(v if v > 0 else 0)
        elif key == 15:
            self.wr[7] = bias_of(v if v > 0 else 0)
        elif key == 16:
            self.lr = (v if v > 0 else 0) / 10.0
        elif key == 18:
            self.forget_ms = (v if v > 0 else 0) * 1000
            self.forget_timer = 0
        elif key == 19:
            self.command(v)
        self.dirty = True

    def rx_poll(self):
        # The interface changes the weights and the settings of the running mode: it writes the four
        # body LEDs through the Bluetooth command (the firmware stores what it is given, and these
        # getters read it back). The same channel as the cards interface, with another message:
        # twelve 4-bit values make a frame:
        #   0 message number, 1 always 15 (the mode never writes 15 on that channel: this is what
        #   tells a frame from its own lights), 2 last-frame flag (8) + frame number, 3..10 eight
        #   nibbles of the message, 11 checksum.
        # The message is a number of items (two nibbles) then the items, five nibbles each: a key
        # (two) and a value (three, signed 12 bits). Keys: 0..6 left wheel weights of the sensors,
        # 7..13 right wheel weights, in tenths; 14 and 15 the speed of the left and the right wheel
        # with nothing in front (the bias weights, in tenths); 16 learning step (tenths), 18
        # forgetting delay (seconds, 0 = never), 19 a command (CMD_*). Once complete the message is
        # applied and answered by "@@ack n". The mode's next tick puts its own lights back.
        if rgb[0].get_intensity_green() != 15:
            return
        n = []
        for i in range(4):
            led = rgb[i]
            n.append(led.get_intensity_red())
            n.append(led.get_intensity_green())
            n.append(led.get_intensity_blue())
        total = 5
        for i in range(11):
            total += (i + 1) * n[i]
        if (total & 15) != n[11]:
            return
        self.dirty = True               # the frame has set the circle and the Lego LEDs too: they are drawn again
        if n[0] != self.rx_msg:
            self.rx_msg = n[0]
            self.rx_got = {}
            self.rx_last = -1
        self.rx_got[n[2] & 7] = n[3:11]
        if n[2] & 8:
            self.rx_last = n[2] & 7
        if self.rx_last < 0:
            return
        stream = []
        for i in range(self.rx_last + 1):
            if i not in self.rx_got:
                return
            stream += self.rx_got[i]
        self.rx_got = {}
        self.rx_last = -1
        count = stream[0] * 16 + stream[1]
        if len(stream) < 2 + 5 * count:
            return
        msg = self.rx_msg
        pos = 2
        for k in range(count):
            key = stream[pos] * 16 + stream[pos + 1]
            v = (stream[pos + 2] << 8) | (stream[pos + 3] << 4) | stream[pos + 4]
            if v >= 2048:
                v -= 4096
            pos += 5
            self.item(key, v)
        say("ack", msg)
        self.report_all()

    # ---- buttons and states ----------------------------------------------------------------------
    def pause(self):
        if self.state != ST_PAUSE:
            self.prev_state = self.state
            self.set_state(ST_PAUSE)
            self.stop()

    def resume(self):
        if self.state == ST_PAUSE:
            self.collision = [0] * 7
            self.timer = 0
            self.set_state(ST_FREEZE if self.prev_state == ST_FREEZE else ST_DRIVE)

    def is_frozen(self):
        # learning is off: in the freeze state, or paused out of it (the resume goes back to it)
        return self.state == ST_FREEZE or (self.state == ST_PAUSE and self.prev_state == ST_FREEZE)

    def toggle_freeze(self):
        if self.is_frozen():
            self.command(CMD_LEARN)
            self.resume()
        else:
            self.command(CMD_FREEZE)
            self.resume()

    # ---- one tick of the mode (ANN_Run) ----------------------------------------------------------------
    def body(self):
        s = self.state
        if s == ST_DRIVE:
            # Common_GetBodyColorPulse(): up in 1.3 s, down in 2.6 s
            self.pulse += 1
            if self.pulse > 0:
                b = self.pulse >> 2
                if self.pulse >= (MAXB << 2):
                    self.pulse = -(MAXB << 3)
            else:
                b = -(self.pulse >> 3)
            set_body(b, b, b)
        elif s == ST_BACK:
            set_body(MAXB, 0, 0)
        elif s == ST_LEARN:
            set_body(0, MAXB, 0)
        elif s == ST_FREEZE:
            set_body(MAXB // 2, MAXB // 2, 0)
        else:
            set_body(2, 2, 6)

    def draw(self):
        # Leds_SetCircleBrightness(...) and Leds_SetLegoProgress(), when the weights have changed
        a = abs
        wl = self.wl
        wr = self.wr
        v = (a(wr[2]) + a(wl[2]), a(wr[3]) + a(wr[4]), a(wl[3]) + a(wl[4]), a(wr[5]) + a(wl[5]),
             0, a(wr[6]) + a(wl[6]), a(wl[0]) + a(wl[1]), a(wr[0]) + a(wr[1]))
        for i in range(8):
            circle[i].intensity(led16(v[i]))
        lego_progress(self.learnt)
        self.dirty = False

    def collide(self):
        # prox(): a front sensor over the threshold is a collision
        p = self.p
        hit = 0
        for i in range(5):
            if p[i] > COLLISION:
                hit = 1
        if not hit:
            return
        play_sound(SND_COLLISION)
        self.set_state(ST_BACK)
        self.timer = 0
        self.ml = BACK_SPEED
        self.mr = BACK_SPEED
        mask = 0
        for j in range(7):
            if p[j] > COLLISION:
                mask |= 1 << j
                if j == 2:
                    self.collision[j] = 1 if p[1] > p[3] else 2
                else:
                    self.collision[j] = 1
        say("hit", mask)

    def net_step(self):
        self.timer += 100
        self.forget_timer += 100
        s = self.state
        if s == ST_DRIVE or s == ST_FREEZE:
            self.compute()
        if s == ST_BACK and self.timer >= BACK_MS:
            self.stop()
            self.set_state(ST_LEARN)
            self.timer = 0
            play_sound(SND_LEARN)
            self.learn()
        elif s == ST_LEARN and self.timer >= LEARN_MS:
            self.stop()
            self.set_state(ST_DRIVE)
        if self.forget_ms > 0 and self.forget_timer >= self.forget_ms and self.state != ST_FREEZE and self.state != ST_PAUSE:
            self.forget_timer = 0
            self.forget()
        if self.state == ST_PAUSE:
            self.forget_timer = 0
            self.stop()
        say("n", self.state, *self.p + [self.ml, self.mr, self.learnt, 0 if self.is_frozen() else 1])

    def tick(self):
        status = btn.get_status()   # [BACKWARD, LEFT, CENTER, FORWARD, RIGHT]
        if self.e_center(status[2]):
            say("exit")
            self.quit = True
            return
        self.rx_poll()
        for i in range(7):
            self.p[i] = prox[i].value()
        if self.state == ST_DRIVE:
            self.collide()
        self.ticks += 1
        if self.ticks % NET_TICKS == 0:
            self.net_step()
        if self.e_back(status[0]):
            self.pause()
        if self.e_fwd(status[3]):
            self.resume()
        if self.e_side(status[1] or status[4]):
            self.toggle_freeze()
        self.beat += 1
        if self.beat >= HEARTBEAT_TICKS:
            self.report_all()
        self.body()
        if self.dirty:
            self.draw()
        mot.set_speed(self.ml, self.mr)


def cleanup():
    # whatever happened (centre button, STOP from the interface, an error):
    # stop the motors, switch the LEDs off, give the robot back
    try:
        mot.set_speed(0, 0)
        set_body(0, 0, 0)
        for i in range(8):
            circle[i].intensity(0)
            lego_f[i].intensity(0)
            lego_b[i].intensity(0)
    finally:
        beh.enable_behaviors()
        say("bye")


def run(step10=None, base10=None, forget_s=None, weights=None, base10r=None):
    # step10: the learning step in tenths (30 = 3), base10: the speed with nothing in front, in tenths
    # (667 = the firmware's 2000 / 30; the left wheel's, and the right wheel's too unless base10r is
    # given), forget_s: seconds between two forgettings (0: never),
    # weights: the 14 weights in tenths, separated by commas (left wheel's 7 then right wheel's 7), or ""
    if step10 is None:
        step10 = STEP10
    if base10 is None:
        base10 = BASE10
    if forget_s is None:
        forget_s = FORGET_S
    if weights is None:
        weights = WEIGHTS
    beh.disable_behaviors()
    beh.enable_leds_proximity()
    try:
        brain = Brain(step10, base10, forget_s, weights, base10r)
        brain.body()
        brain.draw()
        say("hello", 1)
        say("bat", thymio.get_battery_voltage())
        say("state", STATE_NAMES[brain.state])
        brain.report_all()
        while not brain.quit:
            t0 = time.ticks_ms()
            brain.tick()
            left = TICK_MS - time.ticks_diff(time.ticks_ms(), t0)
            if left > 0:
                time.sleep_ms(left)
    finally:
        cleanup()
