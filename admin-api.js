import { SITE_CONFIG } from './site-config.js?v=3.1.51';
// Pembina (~1 MB) mengambil beberapa saat untuk dihantar pada sambungan sekolah. Pelayar yang
// boleh membuka gzip menerima badan yang dimampatkan; yang lama terus dapat JSON biasa.
const GZIP_CAPABLE = typeof DecompressionStream === 'function' && typeof Response === 'function';
const CONFIG_KEY='relief-skpr-config-v1';
export function loadConfig() {
  let saved={};try {saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}');} catch {}
  const config={apiUrl:SITE_CONFIG.apiUrl||saved.apiUrl||'',autoSync:true};
  localStorage.setItem(CONFIG_KEY,JSON.stringify(config));return config;
}
export function saveConfig(config) {localStorage.setItem(CONFIG_KEY,JSON.stringify({apiUrl:config.apiUrl,autoSync:true}));}
export class ApiClient {
  constructor(config) {this.config=config;this.token='';}
  isConfigured() {return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(this.config.apiUrl||'');}
  async request(action,data={},privateRequest=false) {
    if(!this.isConfigured()) throw new Error('Sambungan sekolah belum disediakan. Masukkan URL Apps Script sekolah.');
    if(privateRequest&&!this.token) throw new Error('Sila login sebagai admin.');
    const body=JSON.stringify({action,data,token:privateRequest?this.token:undefined,gz:GZIP_CAPABLE?1:0});
    return this.readResponse(await fetch(this.config.apiUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body,redirect:'follow',keepalive:body.length<60000}));
  }
  async health() {if(!this.isConfigured()) throw new Error('URL Apps Script belum ditetapkan.');return this.readResponse(await fetch(`${this.config.apiUrl}?action=health${GZIP_CAPABLE?'&gz=1':''}`,{cache:'no-store'}));}
  async publicData(revision, day) {
    if(!this.isConfigured()) throw new Error('Sambungan sekolah belum disediakan.');
    const since=Number(revision);
    const parts=[];
    if(Number.isInteger(since)&&since>0) parts.push(`revision=${since}`);
    // The payload depends on the calendar day: a timetable version takes effect at midnight.
    if(/^\d{4}-\d{2}-\d{2}$/.test(String(day||''))) parts.push(`day=${day}`);
    const query=parts.length?`&${parts.join('&')}`:'';
    return this.readResponse(await fetch(`${this.config.apiUrl}?action=public${query}${GZIP_CAPABLE?'&gz=1':''}`,{cache:'no-store'}));
  }
  async status() {if(!this.isConfigured()) throw new Error('Sambungan sekolah belum disediakan.');return this.readResponse(await fetch(`${this.config.apiUrl}?action=status${GZIP_CAPABLE?'&gz=1':''}`,{cache:'no-store'}));}
  // Login returns a session only: pulling the whole school database inside the login request is
  // what made logging in wait on six sheet reads. The app shows its cached view at once and loads
  // the private data in the background.
  async login(username,password) {const result=await this.request('login',{username,password,includeBootstrap:false});this.token=result.token;return result;}
  async logout() {try {if(this.token) await this.request('logout',{},true);} finally {this.token='';}}
  bootstrap(sinceRevision) {return this.request('bootstrap',sinceRevision?{sinceRevision}:{},true);}
  builderData() {return this.request('builder',{},true);}
  write(action,data) {return this.request(action,data,true);}
  async readResponse(response) {
    if(!response.ok) throw new Error(`Sambungan gagal (${response.status}).`);
    let data=await response.json();
    if(data&&data.gz) data=await inflatePayload(data.gz);
    if(!data.ok) {const error=new Error(data.error||'Operasi gagal.');error.code=data.code;throw error;}return data;
  }
}

// Apps Script tidak boleh memampatkan badan sendiri, jadi ia menghantar base64 gzip dan pelayar
// membukanya di sini.
async function inflatePayload(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  return JSON.parse(text);
}
