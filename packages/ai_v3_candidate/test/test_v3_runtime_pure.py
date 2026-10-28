"""Tests for diagnostics that need no model checkpoint or GPU."""
import unittest

from inspectescrow_v3_runtime import (encode_score, verdict, score_replay_diagnostic,
                                      THRESHOLD_SCALED_CANDIDATE as T)


class TestPurePolicy(unittest.TestCase):
    def test_round_half_up(self):
        self.assertEqual(encode_score(1.0000005), 1000001)

    def test_negative_rejected(self):
        with self.assertRaises(ValueError):
            encode_score(-0.1)

    def test_nan_rejected(self):
        with self.assertRaises(ValueError):
            encode_score(float("nan"))

    def test_float_score_encoding_rejected(self):
        self.assertEqual(score_replay_diagnostic(float(T), T)[1], "INVALID_ENCODING")

    def test_boundary_rule(self):
        self.assertEqual(verdict(T - 1), "PASS")
        self.assertEqual(verdict(T), "REVIEW_REQUIRED")

    def test_numeric_match_limit(self):
        self.assertTrue(score_replay_diagnostic(T - 5000, T - 4488)[0])
        self.assertEqual(score_replay_diagnostic(T - 5000, T - 4487)[1], "NUMERIC_MISMATCH")

    def test_flip_rejected(self):
        self.assertEqual(score_replay_diagnostic(T - 1, T)[1], "DECISION_MISMATCH")

    def test_bool_rejected(self):
        self.assertEqual(score_replay_diagnostic(True, T)[1], "INVALID_ENCODING")

    def test_no_unsigned_attestation(self):
        self.assertTrue(score_replay_diagnostic(T, T)[0])


if __name__ == "__main__":
    unittest.main()
