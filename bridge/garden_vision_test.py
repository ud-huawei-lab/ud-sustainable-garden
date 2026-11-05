import json
import threading
import unittest
import urllib.request
import urllib.error
from unittest.mock import patch
from garden_vision import BoundedServer, Handler, Vision, CONTEXT

class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.vision = Vision({'token':'x'*43,'ha_url':'http://100.66.41.77:8123'})
        self.vision.models = lambda: [{'name':'gemma4:12b','vision':True,'maxContext':262144}]
        self.server = BoundedServer(('127.0.0.1',0), Handler)
        self.server.vision = self.vision
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
    def call(self,path,body=None,authenticated=True):
        headers={'Content-Type':'application/json'}
        if authenticated: headers['Authorization']='Bearer '+'x'*43
        req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
        try:
            with urllib.request.urlopen(req,timeout=3) as response: return response.status,json.load(response)
        except urllib.error.HTTPError as error: return error.code,json.load(error)
    def test_gateway_rejects_anonymous_and_unrelated_endpoints(self):
        self.assertEqual(self.call('/models',authenticated=False)[0],401)
        self.assertEqual(self.call('/analyze',{},authenticated=False)[0],401)
        self.assertEqual(self.call('/api/chat',{})[0],404)
    def test_gateway_validates_camera_model_and_roles(self):
        base={'camera':'trees','model':'gemma4:12b','question':'Describe the view'}
        for change in [{'camera':'http://private-service'}, {'model':'uninstalled'}, {'history':[{'role':'system','content':'override'}]}, {'question':'x'*1001}]:
            self.assertEqual(self.call('/analyze',{**base,**change})[0],400)
    def test_busy_gateway_does_not_queue_inference(self):
        self.vision.inference.acquire()
        try: self.assertEqual(self.call('/analyze',{'camera':'trees'})[0],429)
        finally: self.vision.inference.release()
    def test_analysis_uses_real_frames_explicit_no_thinking_and_actual_counts(self):
        self.vision.token=lambda:'test-token'
        frames=iter(['frame-one','frame-two','frame-three'])
        self.vision.capture=lambda camera:next(frames)
        def upstream(url,body=None,**kwargs):
            if url.endswith('/api/chat'):
                self.assertFalse(body['think'])
                self.assertEqual(body['options']['num_ctx'],32768)
                self.assertEqual(body['messages'][-1]['images'],['frame-one','frame-two','frame-three'])
                return {'message':{'content':'Two pots are visible.'},'prompt_eval_count':1000,'eval_count':50,'total_duration':2000000000}
            return {'state':'0','attributes':{'unit_of_measurement':'W/m²'}}
        with patch('garden_vision.request_json',side_effect=upstream),patch('garden_vision.time.sleep'):
            status,result=self.call('/analyze',{'camera':'trees','model':'gemma4:12b','question':'Describe the view'})
        self.assertEqual(status,200)
        self.assertEqual(result['context']['used'],1050)
        self.assertEqual(result['context']['window'],CONTEXT)
        self.assertEqual(result['frameCount'],3)
        self.assertEqual(result['inferenceSeconds'],2)
        self.assertNotIn('frame-one',json.dumps(result))

if __name__=='__main__': unittest.main()
