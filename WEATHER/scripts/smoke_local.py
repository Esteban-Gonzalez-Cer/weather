"""Start and stop only our own service; never reads or prints credentials."""
import argparse
import json
import os
import signal
import socket
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('service', choices=['backend', 'pipeline'])
args = parser.parse_args()
port = 8000 if args.service == 'backend' else 8080
with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', port)) == 0:
        raise SystemExit(f'El puerto {port} ya está ocupado. No se modificó ese servicio.')
logs = root / '.cache'
logs.mkdir(exist_ok=True)
log_path = logs / f'{args.service}-smoke.log'
with log_path.open('w') as output:
    process = subprocess.Popen(['/bin/sh', str(root / args.service / 'run.sh')],
                               cwd=root, stdout=output, stderr=subprocess.STDOUT,
                               stdin=subprocess.DEVNULL, start_new_session=True)
    try:
        started, healthy = time.monotonic(), False
        path = '/health' if args.service == 'backend' else '/api/v2/monitor/health'
        while time.monotonic() - started < 45:
            if process.poll() is not None:
                break
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=2) as response:
                    payload = json.load(response)
                if args.service == 'backend':
                    healthy = payload.get('status') == 'ok'
                else:
                    healthy = all(payload.get(component, {}).get('status') == 'healthy'
                                  for component in ('metadatabase', 'scheduler', 'dag_processor', 'triggerer'))
                if healthy:
                    print(f'{args.service}: HTTP 200; health checks passed.')
                    break
            except (OSError, ValueError):
                pass
            time.sleep(1)
        if not healthy:
            raise SystemExit(f'{args.service}: startup did not pass. Inspect the local ignored log at {log_path}.')
        if args.service == 'backend':
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{port}/api/v1/me/recent-locations', timeout=2)
            except urllib.error.HTTPError as error:
                if error.code != 401:
                    raise
                print('Protected endpoint: HTTP 401 without a session, as expected.')
            else:
                raise SystemExit('Protected endpoint accepted an unauthenticated request.')
    finally:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        except ProcessLookupError:
            pass
