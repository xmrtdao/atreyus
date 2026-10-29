import sys
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import httpx
from main import app, merge, assign_rooms, associate_tags, manifest_path, write_json

class PipelineRegressionTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.meta={'clip':[900,130,1400,730],'zoom':4,'imageWidth':2000,'imageHeight':2400,
                   'referenceIndex':0,'words':[],'labels':[]}

    def test_uncovered_point_does_not_crash_traced_room_assignment(self):
        detections=[{'type':'switch','center':[10,10]}, {'type':'receptacle-wp-240','center':[1000,100]}]
        rooms=assign_rooms(detections,self.meta)
        self.assertEqual(detections[1]['roomId'],'Exterior')
        self.assertIsNone(detections[0]['roomId'])
        self.assertEqual(sum(r['id']=='Exterior' for r in rooms),1)

    def test_adjacent_switches_survive_model_deduplication(self):
        def det(x,source):return {'type':'switch','center':[x,100],'bbox':[x-4,95,x+4,105],
                                  'confidence':.9,'source':source}
        result=merge([det(100,'vector-legend'),det(120,'vector-legend'),det(101,'mepdetect')],self.meta)
        self.assertEqual(len(result),2)
        self.assertIn('mepdetect',result[0]['supportingSources'])

    def test_fan_center_j_is_not_an_extra_junction_box(self):
        ds=[{'type':t,'center':[100,100],'confidence':.99,'source':'vector-legend'}
            for t in ['junction-box','ceiling-fan']]
        self.assertEqual([d['type'] for d in merge(ds,self.meta)],['ceiling-fan'])

    def test_compound_wp_240_device_is_one_component(self):
        self.meta['words']=[[945,143,955,147,'WP'],[945,150,955,156,'240V'],[945,156,955,160,'GFI']]
        result=associate_tags([{'type':'receptacle','center':[200,140]}],self.meta)
        self.assertEqual(len(result),1)
        self.assertEqual(result[0]['type'],'receptacle-wp-240')
        self.assertIn('GFI',result[0]['tags'])

    async def test_invalid_uploads_have_actionable_status(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            self.assertEqual((await client.post('/api/takeoff/upload',files={'file':('bad.txt',b'hello')})).status_code,415)
            response=await client.post('/api/takeoff/upload',files={'file':('bad.pdf',b'not a pdf')})
            self.assertEqual(response.status_code,422)
            self.assertIn('readable PDF',response.json()['detail'])

    async def test_path_traversal_rejected(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test') as client:
            response=await client.post('/api/takeoff/analyze',json={'plan':'../../relay/.env'})
            self.assertEqual(response.status_code,400)

    def test_atomic_snapshot_survives_temporary_windows_file_lock(self):
        original=Path.replace
        calls=[]
        def locked_twice(path,target):
            calls.append(1)
            if len(calls)<3:raise PermissionError(13,'File temporarily locked')
            return original(path,target)
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'job.json'
            target.write_text('{"status":"working"}')
            with patch.object(Path,'replace',locked_twice):write_json(target,{'status':'completed'})
            self.assertIn('completed',target.read_text())
            self.assertEqual(len(calls),3)
            self.assertEqual(len(list(Path(folder).glob('*.tmp'))),0)

if __name__=='__main__':unittest.main()
