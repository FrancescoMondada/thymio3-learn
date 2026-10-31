"""Tests of src/py/ann_mode.py on a virtual robot.

    python3 -I -m unittest tests/test_ann_mode.py -v          (from the project root)
    python3 -I tests/test_ann_mode.py --golden tests/golden-ann.json

--golden writes the inputs and the outputs of a long scenario, and some frames; tests/ann.test.js
replays the same inputs through the JavaScript port of the mode (the virtual robot of the web
interface) and compares what it says and does, tick by tick.
"""
import json
import os
import random
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fake_ann_robot import VirtualRobot, Wall, load, prox_from_distance  # noqa: E402

SOURCE = open(os.path.join(HERE, "..", "src", "py", "ann_mode.py")).read()

# items of the interface's messages (see rx_poll in the mode)
KEY_WL, KEY_WR, KEY_BASE_L, KEY_BASE_R, KEY_STEP, KEY_FORGET, KEY_CMD = 0, 7, 14, 15, 16, 18, 19
CMD_RESET, CMD_PAUSE, CMD_RESUME, CMD_FREEZE, CMD_LEARN, CMD_QUIT, CMD_REPORT = 1, 2, 3, 4, 5, 6, 7


def checksum(n):
    t = 5
    for i in range(11):
        t += (i + 1) * n[i]
    return t & 15


def encode(items, msg):
    """The frames (twelve 4-bit values each) of a message of (key, value) items. See liveFrames in protocol.js."""
    stream = [len(items) >> 4, len(items) & 15]
    for key, v in items:
        v &= 0xFFF
        stream += [key >> 4, key & 15, (v >> 8) & 15, (v >> 4) & 15, v & 15]
    count = max(1, -(-len(stream) // 8))
    assert count <= 8
    frames = []
    for i in range(count):
        data = stream[i * 8:i * 8 + 8]
        data += [0] * (8 - len(data))
        f = [msg & 15, 15, (8 if i == count - 1 else 0) | i] + data + [0]
        f[11] = checksum(f)
        frames.append(f)
    return frames


def weights(lines):
    """The last "@@w" line as ([left 7], [right 7]) in tenths."""
    w = lines[-1].split(" ")[1:15]
    v = [int(x) for x in w]
    return v[:7], v[7:]


def run(robot, ticks, args="", source=SOURCE):
    robot.max_ticks = ticks
    return load(source, robot, "\nrun(%s)\n" % args)


class Drive(unittest.TestCase):
    def test_wall_ahead_back_learn(self):
        # the robot drives straight at a wall: it backs up for a second, learns, and goes on
        r = VirtualRobot()
        Wall(r, 120)
        run(r, 370)
        states = [(t, ln.split(" ")[1]) for t, ln in r.lines if ln.startswith("@@state")]
        self.assertEqual([s for _, s in states], ["drive", "back", "learn", "drive"])
        t_back = states[1][0]
        t_learn = states[2][0]
        self.assertTrue(45 <= t_learn - t_back <= 50, "backs up for 0.9 to 1.0 s: %d ticks" % (t_learn - t_back))
        self.assertEqual(r.sounds[0][1], 50)                          # the collision
        self.assertEqual(r.sounds[1][1], 3)                           # the learning
        # drives at 66 (2000 / 30), backs up at -200, stops to learn
        speeds = [(l, rr) for _, l, rr in r.speeds]
        self.assertIn((66, 66), speeds)
        self.assertIn((-200, -200), speeds)
        # the front sensor alone: the right wheel is slowed by half a step if the left side was closer, else the left
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wr, [0, 0, 0, 0, 0, 0, 0])
        self.assertEqual(wl, [0, 0, -15, 0, 0, 0, 0])                 # p[1] == p[3] -> "2": the left wheel
        self.assertEqual(r.last_lines("learn")[-1], "@@learn 1")
        hits = r.last_lines("hit")
        self.assertEqual(hits, ["@@hit 4"])                           # only sensor 2

    def test_learns_to_turn_away(self):
        # an obstacle on the left, three times: the left wheel gets faster and the right wheel slower
        r = VirtualRobot()
        phase = {"n": 0}

        def on_tick(robot):
            # the left sensors are close for 3 ticks, every 3 s
            robot.prox = [3600, 3500, 0, 0, 0, 0, 0] if (robot.tick % 150) in (10, 11, 12) else [0] * 7
        r.on_tick = on_tick
        run(r, 480)
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wl[:2], [90, 90])                            # 3 hits x 3.0
        self.assertEqual(wr[:2], [-90, -90])
        self.assertEqual(r.last_lines("learn")[-1], "@@learn 3")
        # now the same reading makes the robot veer right: left wheel faster than right wheel
        r2 = VirtualRobot()
        r2.on_tick = lambda robot: setattr(robot, "prox", [2000, 0, 0, 0, 0, 0, 0])
        run(r2, 40, "30, 667, 16, '60,0,0,0,0,0,0,-60,0,0,0,0,0,0'")
        l, rr = r2.last["speed"]
        self.assertEqual((l, rr), (int((2000 / 20 * 6 + 2000) / 30), int((2000 / 20 * -6 + 2000) / 30)))
        self.assertGreater(l, rr)

    def test_right_obstacle_turns_left_and_both_sides_equal_when_front(self):
        r = VirtualRobot()
        r.on_tick = lambda robot: setattr(robot, "prox", [0, 0, 0, 3500, 3400, 0, 0] if robot.tick == 10 else [0] * 7)
        run(r, 150)
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wr[3:5], [30, 30])
        self.assertEqual(wl[3:5], [-30, -30])
        # the front sensor: right closer than left -> the left wheel slows? (p[1] > p[3] -> collision 1 -> right wheel)
        r = VirtualRobot()
        r.on_tick = lambda robot: setattr(robot, "prox", [0, 3000, 3400, 2000, 0, 0, 0] if robot.tick == 10 else [0] * 7)
        run(r, 150)
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wr[2], -15)
        self.assertEqual(wl[2], 0)

    def test_back_sensors_do_not_cause_a_collision(self):
        r = VirtualRobot()
        r.on_tick = lambda robot: setattr(robot, "prox", [0, 0, 0, 0, 0, 4000, 4000])
        run(r, 100)
        self.assertEqual([ln for _, ln in r.lines if ln.startswith("@@hit")], [])

    def test_forgetting(self):
        r = VirtualRobot()
        run(r, 900, "30, 667, 16, '30,5,0,0,0,0,0,-30,-5,0,0,0,0,0'")
        # 16 s = 800 ticks: every weight moves 1 towards 0 (never past it): 3 -> 2, 0.5 -> 0
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wl, [20, 0, 0, 0, 0, 0, 0])
        self.assertEqual(wr, [-20, 0, 0, 0, 0, 0, 0])
        # another 16 s: 2 -> 1; and after the next one 0 (not -1)
        r = VirtualRobot()
        run(r, 2500, "30, 667, 16, '30,5,0,0,0,0,0,-30,-5,0,0,0,0,0'")
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual((wl, wr), ([0] * 7, [0] * 7))
        # forgetting off
        r = VirtualRobot()
        run(r, 1700, "30, 667, 0, '30,5,0,0,0,0,0,-30,-5,0,0,0,0,0'")
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wl[:2], [30, 5])

    def test_speed_and_clamp(self):
        r = VirtualRobot()
        run(r, 12, "30, 1200, 16, ''")                                   # 120.0
        self.assertEqual(r.last["speed"], (120, 120))
        r = VirtualRobot()
        r.on_tick = lambda robot: setattr(robot, "prox", [3200, 0, 0, 0, 0, 0, 0])
        run(r, 12, "30, 667, 16, '1000,0,0,0,0,0,0,0,0,0,0,0,0,0'")       # 100.0 on sensor 0: 3200/20*100/30 = 533 + 66 -> 500
        self.assertEqual(r.last["speed"][0], 500)


class Interface(unittest.TestCase):
    def feed(self, r, schedule):
        """schedule: {tick: [frames]} one frame per tick, in order, written before the tick runs."""
        queue = {}
        for tick, frames in schedule.items():
            for i, f in enumerate(frames):
                queue[tick + i] = f

        def on_tick(robot):
            if robot.tick in queue:
                robot.inject(queue[robot.tick])
        r.on_tick = on_tick

    def test_set_a_weight_and_the_settings(self):
        r = VirtualRobot()
        items = [(KEY_WL + 0, 45), (KEY_WR + 4, -25), (KEY_STEP, 50), (KEY_BASE_L, 1000), (KEY_BASE_R, 700), (KEY_FORGET, 0)]
        self.feed(r, {10: encode(items, 3)})
        run(r, 60)
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wl[0], 45)
        self.assertEqual(wr[4], -25)
        self.assertEqual(r.last_lines("p")[-1], "@@p 50 1000 700 0")
        self.assertEqual(r.last_lines("ack"), ["@@ack 3"])
        self.assertEqual(r.last["speed"], (100, 70))                  # each wheel has its own base speed: 100 and 70
        # the mode's own lights took the frame's place at the tick that read it
        self.assertNotEqual(r.rgb[0][1], 15)

    def test_each_wheel_can_start_with_its_own_base_speed(self):
        r = VirtualRobot()
        run(r, 40, "30, 667, 16, '', 400")
        self.assertEqual(r.last_lines("p")[-1], "@@p 30 667 400 16")
        self.assertEqual(r.last["speed"], (66, 40))                   # the firmware's 66.7 on the left, 40 on the right

    def test_a_negative_value_and_many_items_in_eight_frames(self):
        r = VirtualRobot()
        items = [(k, ((k * 37) % 200) - 100) for k in range(12)]
        frames = encode(items, 9)
        self.assertEqual(len(frames), 8)
        self.feed(r, {10: frames})
        run(r, 60)
        wl, wr = weights(r.last_lines("w"))
        want = [v for _, v in items] + [0, 0]
        self.assertEqual(wl + wr, want)

    def test_a_lost_frame_or_a_wrong_sum_applies_nothing(self):
        r = VirtualRobot()
        frames = encode([(KEY_WL, 50), (KEY_WL + 1, 60), (KEY_WL + 2, 70), (KEY_WR, 80)], 4)
        self.assertEqual(len(frames), 3)
        bad = list(frames[1])
        bad[11] = (bad[11] + 1) & 15
        self.feed(r, {10: [frames[0], bad, frames[2]]})
        run(r, 60)
        self.assertEqual(r.last_lines("ack"), [])
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wl + wr, [0] * 14)
        # the same message sent again (another number) with all its frames works
        r = VirtualRobot()
        self.feed(r, {10: [frames[0], bad, frames[2]], 30: encode([(KEY_WL, 50), (KEY_WL + 1, 60), (KEY_WL + 2, 70), (KEY_WR, 80)], 5)})
        run(r, 80)
        self.assertEqual(r.last_lines("ack"), ["@@ack 5"])
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual((wl[:3], wr[0]), ([50, 60, 70], 80))

    def test_commands(self):
        r = VirtualRobot()
        seq = {
            10: encode([(KEY_WL + 1, 40), (KEY_CMD, CMD_PAUSE)], 1),
            30: encode([(KEY_CMD, CMD_RESUME)], 2),
            50: encode([(KEY_CMD, CMD_FREEZE)], 3),
            70: encode([(KEY_CMD, CMD_LEARN)], 4),
            90: encode([(KEY_CMD, CMD_RESET)], 5),
        }
        self.feed(r, seq)
        run(r, 120)
        states = [ln.split(" ")[1] for _, ln in r.lines if ln.startswith("@@state")]
        self.assertEqual(states, ["drive", "pause", "drive", "freeze", "drive"])
        wl, wr = weights(r.last_lines("w"))
        self.assertEqual(wl, [0] * 7)                                 # reset
        self.assertEqual(len(r.last_lines("ack")), 5)
        # in the pause the wheels are stopped
        paused = [(t, l, rr) for t, l, rr in r.speeds if 12 <= t <= 28]
        self.assertTrue(all(l == 0 and rr == 0 for _, l, rr in paused))

    def test_the_n_line_says_if_it_learns_even_through_a_pause(self):
        # the last number of @@n: 1 learns, 0 frozen. A pause does not change it (the resume goes back to it), and learning can be
        # turned on or off during the pause.
        r = VirtualRobot()
        self.feed(r, {
            10: encode([(KEY_CMD, CMD_FREEZE)], 1),
            40: encode([(KEY_CMD, CMD_PAUSE)], 2),
            70: encode([(KEY_CMD, CMD_RESUME)], 3),
            100: encode([(KEY_CMD, CMD_PAUSE)], 4),
            130: encode([(KEY_CMD, CMD_LEARN)], 5),
            160: encode([(KEY_CMD, CMD_RESUME)], 6),
        })
        run(r, 200)
        ns = [(t, ln.split()) for t, ln in r.lines if ln.startswith("@@n ")]
        for name, t0, t1, state, learns in [
            ("drive", 0, 10, "0", "1"), ("frozen", 20, 40, "4", "0"), ("paused out of the freeze", 50, 70, "5", "0"),
            ("frozen again", 80, 100, "4", "0"), ("paused, still frozen", 110, 130, "5", "0"),
            ("paused, learning back on", 140, 160, "5", "1"), ("driving and learning", 170, 200, "0", "1"),
        ]:
            seen = [w for t, w in ns if t0 <= t < t1]
            self.assertTrue(seen, name)
            for w in seen:
                self.assertEqual((w[1], w[-1]), (state, learns), name)

    def test_frozen_robot_does_not_learn(self):
        r = VirtualRobot()
        seq = {5: encode([(KEY_CMD, CMD_FREEZE)], 1)}
        self.feed(r, seq)
        prev = r.on_tick

        def on_tick(robot):
            prev(robot)
            if robot.tick == 40:
                robot.prox = [3600, 3600, 3600, 3600, 3600, 0, 0]
        r.on_tick = on_tick
        run(r, 120)
        self.assertEqual([ln for _, ln in r.lines if ln.startswith("@@hit")], [])
        self.assertEqual(r.last_lines("learn"), [])

    def test_quit_from_the_interface_and_the_centre_button(self):
        r = VirtualRobot()
        self.feed(r, {10: encode([(KEY_CMD, CMD_QUIT)], 1)})
        run(r, 100)
        self.assertEqual(r.last_lines("exit"), ["@@exit"])
        self.assertEqual(r.last_lines("bye"), ["@@bye"])
        self.assertTrue(r.behaviors_enabled)
        self.assertEqual(r.speed, (0, 0))
        r = VirtualRobot()
        r.on_tick = lambda robot: robot.buttons.__setitem__(2, 1 if robot.tick == 20 else 0)
        run(r, 100)
        self.assertEqual(r.last_lines("exit"), ["@@exit"])

    def test_buttons(self):
        r = VirtualRobot()
        pressed = {20: 0, 60: 3, 100: 1, 140: 1}                        # BACKWARD, FORWARD, LEFT, LEFT

        def on_tick(robot):
            robot.buttons = [0] * 5
            for t, b in pressed.items():
                if t <= robot.tick < t + 3:
                    robot.buttons[b] = 1
        r.on_tick = on_tick
        run(r, 200)
        states = [ln.split(" ")[1] for _, ln in r.lines if ln.startswith("@@state")]
        self.assertEqual(states, ["drive", "pause", "drive", "freeze", "drive"])

    def test_the_hello_and_the_reports(self):
        r = VirtualRobot()
        run(r, 400)
        words = [ln.split(" ")[0] for _, ln in r.lines]
        self.assertEqual(words[:5], ["@@hello", "@@bat", "@@state", "@@w", "@@p"])
        n = [ln for _, ln in r.lines if ln.startswith("@@n ")]
        self.assertEqual(len(n), 80)                                  # one every 100 ms
        self.assertEqual(n[0], "@@n 0 0 0 0 0 0 0 0 66 66 0 1")
        # the weights and the settings are said again every 3 s (150 ticks)
        self.assertGreaterEqual(len([w for w in words if w == "@@w"]), 3)
        # every line is padded to 100 bytes, so that the firmware sends it at once
        # (the harness strips them: check the source)
        self.assertIn('print(s + " " * (99 - len(s)) + "\\x1e", end="")', SOURCE)

    def test_lights_never_look_like_a_message(self):
        # the green channel of the front left LED is 15 only in a message of the interface
        r = VirtualRobot()
        run(r, 400)
        self.assertTrue(all(g != 15 for (_, i, _, g, _) in r.rgb_writes if i == 0))
        self.assertTrue(any(g == 14 for (_, i, _, g, _) in r.rgb_writes if i == 0))
        # the circle shows the weights, the Lego LEDs the number of lessons
        r = VirtualRobot()
        run(r, 4, "30, 667, 16, '30,30,0,0,0,0,0,-30,-30,0,0,0,0,0'")
        self.assertEqual(r.last["circle"][6], 6)                      # |wl0| + |wl1|
        self.assertEqual(r.last["circle"][7], 6)                      # |wr0| + |wr1|
        self.assertEqual(r.last["lego_f"], [0] * 8)


# ---- the golden file ------------------------------------------------------------------------------
def scenario(seed):
    """Inputs for 3000 ticks (60 s): bumps on random sensors, buttons, messages of the interface."""
    rnd = random.Random(seed)
    ticks = 3000
    prox = []
    bump_until = -1
    bump = [0] * 7
    for t in range(ticks):
        if t > bump_until and rnd.random() < 0.012:
            kind = rnd.choice(["left", "right", "front", "all", "back"])
            bump = {
                "left": [3600, rnd.choice([0, 3400, 3500]), 0, 0, 0, 0, 0],
                "right": [0, 0, 0, rnd.choice([0, 3500]), 3700, 0, 0],
                "front": [0, rnd.choice([3000, 3500]), 3500, rnd.choice([3000, 3500]), 0, 0, 0],
                "all": [3500, 3500, 3600, 3500, 3500, 0, 0],
                "back": [0, 0, 0, 0, 0, 3900, 3900],
            }[kind]
            bump_until = t + rnd.randint(1, 6)
        if t <= bump_until:
            prox.append(list(bump))
        else:
            prox.append([rnd.choice([0, 0, 400, 1500, 2600]) if rnd.random() < 0.1 else 0 for _ in range(7)])
    buttons = {}
    for t, b in ((400, 0), (520, 3), (900, 1), (1000, 4), (1600, 0), (1700, 3)):
        for k in range(3):
            buttons[t + k] = b
    msgs = {}
    msg = 0

    def add(t, items):
        nonlocal msg
        msg = msg % 15 + 1
        for i, f in enumerate(encode(items, msg)):
            msgs[t + i] = f

    add(300, [(KEY_WL, 45), (KEY_WR + 4, -25), (KEY_STEP, 50)])
    add(1200, [(KEY_BASE_L, 900), (KEY_BASE_R, 700), (KEY_FORGET, 5), (KEY_WL + 2, -70)])
    add(1800, [(KEY_CMD, CMD_FREEZE)])
    add(2000, [(KEY_CMD, CMD_LEARN), (KEY_STEP, 20)])
    add(2400, [(KEY_CMD, CMD_RESET), (KEY_WR + 1, 33)])
    return ticks, prox, buttons, msgs


def record(seed, source=None):
    source = source or SOURCE
    ticks, prox, buttons, msgs = scenario(seed)
    r = VirtualRobot()

    def on_tick(robot):
        t = robot.tick
        robot.prox = list(prox[t]) if t < ticks else [0] * 7
        robot.buttons = [0] * 5
        if t in buttons:
            robot.buttons[buttons[t]] = 1
        if t in msgs:
            robot.inject(msgs[t])
    r.on_tick = on_tick
    r.max_ticks = ticks
    # tick 0 runs before on_tick has ever been called
    r.prox = list(prox[0])
    load(source, r, "\nrun()\n")
    return {
        "seed": seed,
        "ticks": ticks,
        "prox": prox,
        "buttons": [[t, b] for t, b in sorted(buttons.items())],
        "frames": [[t, f] for t, f in sorted(msgs.items())],
        "speeds": [list(s) for s in r.speeds],
        "lines": [[t, ln] for t, ln in r.lines],
        "sounds": [list(s) for s in r.sounds],
    }


class Golden(unittest.TestCase):
    def test_the_scenario_runs(self):
        g = record(1)
        words = {ln.split(" ")[0] for _, ln in g["lines"]}
        self.assertTrue({"@@hit", "@@learn", "@@forget", "@@ack", "@@state"} <= words, words)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--same-as":
        # the mode as the interface sends it (minified, see src/script-core.js) must do exactly what the source does
        mini = record(1, open(sys.argv[2]).read())
        full = record(1)
        same = mini["lines"] == full["lines"] and mini["speeds"] == full["speeds"] and mini["sounds"] == full["sounds"]
        print("same" if same else "DIFFERENT")
        sys.exit(0 if same else 1)
    if len(sys.argv) > 2 and sys.argv[1] == "--golden":
        out = {
            "scenarios": [record(s) for s in (1, 2)],
            "frames": [
                {"msg": 3, "items": [[0, 45], [11, -25], [16, 50], [17, 100], [18, 0]], "frames": encode([(0, 45), (11, -25), (16, 50), (17, 100), (18, 0)], 3)},
                {"msg": 9, "items": [[k, ((k * 37) % 200) - 100] for k in range(12)], "frames": encode([(k, ((k * 37) % 200) - 100) for k in range(12)], 9)},
                {"msg": 15, "items": [[19, 1]], "frames": encode([(19, 1)], 15)},
            ],
            "prox_curve": [[d, prox_from_distance(d)] for d in (0, 5, 10, 15.8, 30, 60, 100, 109, 110, 200)],
        }
        with open(sys.argv[2], "w") as f:
            json.dump(out, f, separators=(",", ":"))
        print("wrote", sys.argv[2])
    else:
        unittest.main()
