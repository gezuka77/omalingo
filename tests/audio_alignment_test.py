import importlib.util
from pathlib import Path
import unittest

spec=importlib.util.spec_from_file_location('alignment',Path(__file__).resolve().parents[1]/'audio_alignment.py')
a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)

class AlignmentTests(unittest.TestCase):
 def test_padded_corrections_cannot_cross_a_short_recognized_word(self):
  # Two independent padded corrections separated by a 60ms acoustic anchor.
  left=[(9.31,10.01),(10.01,10.11),(10.11,10.11)]
  anchor=(10.01,10.07)
  right=[(9.95,11.39),(11.39,11.73)]
  raw=left+[anchor]+right
  self.assertGreater(max(t[0] for t in raw[:4])-right[0][0],0.15)
  fixed=a.bound_aligned_span(left,8,10.01,7.88,10.13)+[anchor]+a.bound_aligned_span(right,10.07,12,9.95,12.12)
  self.assertTrue(all(x[0]<=y[0] for x,y in zip(fixed,fixed[1:])))
  self.assertLessEqual(fixed[2][1],anchor[0])
  self.assertGreaterEqual(fixed[4][0],anchor[1])
  self.assertEqual(fixed[-1],right[-1])
 def test_context_does_not_move_valid_interior_timestamps(self):
  times=[(1.2,1.5),(1.5,1.9)]
  self.assertEqual(a.bound_aligned_span(times,1,2,.88,2.12),times)
 def test_impossible_model_timestamps_are_still_rejected(self):
  for times in ([(1.6,1.4)],[(float('nan'),1.5)],[(1.5,float('inf'))],[(0.2,1.5)],[(1.5,3)]):
   with self.subTest(times=times),self.assertRaises(ValueError):a.bound_aligned_span(times,1,2,.88,2.12)
  with self.assertRaises(ValueError):a.bound_aligned_span([(1,2)],2,1,0,3)
 def test_zero_length_span_does_not_invent_speech_duration(self):
  self.assertEqual(a.bound_aligned_span([(1.95,2.05)],2,2,1.88,2.12),[(2,2)])
 def test_split_and_merged_words_preserve_original_token_mapping(self):
  self.assertEqual(a.map_aligned_words(['linja-auto','on'],[('linja',1,1.3),('auto',1.3,1.6),('on',2,2.2)]),[(1,1.6),(2,2.2)])
  self.assertEqual(a.map_aligned_words(['hyvää','päivää'],[('hyvääpäivää',1,2)]),[(1,2),(1,2)])
  with self.assertRaises(ValueError):a.map_aligned_words(['hei'],[('moi',1,2)])
if __name__=='__main__':unittest.main()
