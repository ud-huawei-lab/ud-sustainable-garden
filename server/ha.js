import { WebSocket } from 'ws';

export class HomeAssistant {
  constructor(env) {
    this.url = (env.HA_URL || '').replace(/\/$/, '');
    this.env = env; this.expires = 0; this.access = ''; this.refresh = ''; this.authPromise = null;
    if (this.url && !/^https?:\/\//.test(this.url)) throw new Error('HA_URL must be an HTTP or HTTPS URL.');
  }
  async token() {
    if (this.env.HA_TOKEN) return this.env.HA_TOKEN;
    if (this.access && Date.now() < this.expires) return this.access;
    if (!this.authPromise) this.authPromise = this.authenticate().finally(() => { this.authPromise = null; });
    return this.authPromise;
  }
  async authenticate() {
    if (!this.url || !this.env.HA_USERNAME || !this.env.HA_PASSWORD) throw new Error('Home Assistant credentials are not configured.');
    const client = 'http://localhost:5173/';
    let data;
    if (this.refresh) {
      data = await this.request('/auth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.refresh, client_id: client }) });
    } else {
      const flow = await this.request('/auth/login_flow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: client, handler: ['homeassistant', null], redirect_uri: client }) });
      const login = await this.request(`/auth/login_flow/${flow.flow_id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: client, username: this.env.HA_USERNAME, password: this.env.HA_PASSWORD }) });
      if (login.type !== 'create_entry') throw new Error('Home Assistant sign-in was not completed.');
      data = await this.request('/auth/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code: login.result, client_id: client }) });
    }
    this.access = data.access_token; this.refresh = data.refresh_token || this.refresh;
    this.expires = Date.now() + (data.expires_in - 60) * 1000;
    if (!this.access) throw new Error('Home Assistant did not issue an access token.');
    return this.access;
  }
  async request(path, options = {}) {
    const response = await fetch(`${this.url}${path}`, { ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`Home Assistant request failed (${response.status}).`);
    return response.json();
  }
  async get(path, options = {}) {
    return this.request(path, { ...options, headers: { Authorization: `Bearer ${await this.token()}`, ...options.headers } });
  }
  async raw(path, signal) {
    return fetch(`${this.url}${path}`, { headers: { Authorization: `Bearer ${await this.token()}` }, signal, redirect: 'error' });
  }
  async command(command) {
    const token = await this.token();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`${this.url.replace(/^http/, 'ws')}/api/websocket`, { maxPayload: 8 * 1024 * 1024 });
      const finish = (error, value) => { clearTimeout(timer); socket.close(); error ? reject(error) : resolve(value); };
      const timer = setTimeout(() => finish(new Error('Home Assistant command timed out.')), 25000);
      socket.on('error', () => finish(new Error('Home Assistant connection failed.')));
      socket.on('message', bytes => {
        let message;
        try { message = JSON.parse(bytes.toString()); } catch { return; }
        if (message.type === 'auth_required') socket.send(JSON.stringify({ type: 'auth', access_token: token }));
        if (message.type === 'auth_invalid') finish(new Error('Home Assistant authentication failed.'));
        if (message.type === 'auth_ok') socket.send(JSON.stringify({ id: 1, ...command }));
        if (message.type === 'result' && message.id === 1) finish(message.success ? null : new Error('Home Assistant could not complete the read request.'), message.result);
      });
    });
  }
}
