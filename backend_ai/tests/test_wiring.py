import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pymupdf as fitz
from wiring import trace

class WiringEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.doc=fitz.open();self.page=self.doc.new_page(width=200,height=200)
        self.meta={'clip':[0,0,200,200],'zoom':1,'imageWidth':200,'imageHeight':200,'words':[]}
        self.devices=[{'id':'switch','type':'switch','center':[20,50]},
                      {'id':'light','type':'light-recessed','center':[70,50]}]

    def tearDown(self):self.doc.close()

    def test_trace_preserves_real_dash_evidence_and_geometry(self):
        for a,b in [(20,28),(34.75,42.75),(49.5,57.5),(64.25,70)]:
            self.page.draw_line((a,50),(b,50),width=.24,color=(0,0,0))
        runs,info=trace(self.page,self.meta,self.devices)
        self.assertEqual(len(runs),1)
        self.assertEqual(runs[0]['sourceStrokeIndices'],[0,1,2,3])
        self.assertEqual(runs[0]['dashGaps'],3)
        self.assertAlmostEqual(runs[0]['observedLengthPdfPoints'],50)
        self.assertEqual({runs[0]['fromId'],runs[0]['toId']},{'switch','light'})

    def test_no_proximity_only_connection_without_plotted_strokes(self):
        self.assertEqual(trace(self.page,self.meta,self.devices)[0],[])

    def test_solid_architecture_is_not_priced_as_a_control_cable(self):
        for a,b in [(20,28),(28,36),(36,44),(44,52),(52,60),(60,70)]:
            self.page.draw_line((a,50),(b,50),width=.24,color=(0,0,0))
        self.assertEqual(trace(self.page,self.meta,self.devices)[0],[])

    def test_solid_sink_outline_near_wall_light_is_not_a_cable(self):
        self.devices[1]['type']='light-wall'
        for a,b in [(20,28),(28,36),(36,44),(44,52),(52,60),(60,70)]:
            self.page.draw_line((a,50),(b,50),width=.24,color=(0,0,0))
        self.assertEqual(trace(self.page,self.meta,self.devices)[0],[])

if __name__=='__main__':unittest.main()
