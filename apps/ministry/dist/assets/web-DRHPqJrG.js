import{o as q,d as A,W as Be}from"./index-BEy0tALL.js";import{r as _,_ as R,C,a as L,E as fe,F as Ve,v as We,i as Ge,b as Je,g as D,c as ze}from"./index.esm-DVPIT3hq.js";const le="@firebase/installations",H="0.6.23";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const pe=1e4,ge=`w:${H}`,he="FIS_v2",Ye="https://firebaseinstallations.googleapis.com/v1",Qe=60*60*1e3,Xe="installations",Ze="Installations";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const et={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"not-registered":"Firebase Installation is not registered.","installation-not-found":"Firebase Installation not found.","request-failed":'{$requestName} request failed with error "{$serverCode} {$serverStatus}: {$serverMessage}"',"app-offline":"Could not process request. Application offline.","delete-pending-registration":"Can't delete installation while there is a pending registration request."},h=new fe(Xe,Ze,et);function we(e){return e instanceof Ve&&e.code.includes("request-failed")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function be({projectId:e}){return`${Ye}/projects/${e}/installations`}function ye(e){return{token:e.token,requestStatus:2,expiresIn:nt(e.expiresIn),creationTime:Date.now()}}async function me(e,t){const i=(await t.json()).error;return h.create("request-failed",{requestName:e,serverCode:i.code,serverMessage:i.message,serverStatus:i.status})}function Te({apiKey:e}){return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e})}function tt(e,{refreshToken:t}){const n=Te(e);return n.append("Authorization",it(t)),n}async function Ie(e){const t=await e();return t.status>=500&&t.status<600?e():t}function nt(e){return Number(e.replace("s","000"))}function it(e){return`${he} ${e}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function ot({appConfig:e,heartbeatServiceProvider:t},{fid:n}){const i=be(e),o=Te(e),r=t.getImmediate({optional:!0});if(r){const s=await r.getHeartbeatsHeader();s&&o.append("x-firebase-client",s)}const a={fid:n,authVersion:he,appId:e.appId,sdkVersion:ge},u={method:"POST",headers:o,body:JSON.stringify(a)},d=await Ie(()=>fetch(i,u));if(d.ok){const s=await d.json();return{fid:s.fid||n,registrationStatus:2,refreshToken:s.refreshToken,authToken:ye(s.authToken)}}else throw await me("Create Installation",d)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Se(e){return new Promise(t=>{setTimeout(t,e)})}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function rt(e){return btoa(String.fromCharCode(...e)).replace(/\+/g,"-").replace(/\//g,"_")}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const at=/^[cdef][\w-]{21}$/,$="";function st(){try{const e=new Uint8Array(17);(self.crypto||self.msCrypto).getRandomValues(e),e[0]=112+e[0]%16;const n=ct(e);return at.test(n)?n:$}catch{return $}}function ct(e){return rt(e).substr(0,22)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function m(e){return`${e.appName}!${e.appId}`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const b=new Map;function ke(e,t){const n=m(e);ve(n,t),ft(n,t)}function ut(e,t){Ee();const n=m(e);let i=b.get(n);i||(i=new Set,b.set(n,i)),i.add(t)}function dt(e,t){const n=m(e),i=b.get(n);i&&(i.delete(t),i.size===0&&b.delete(n),Ae())}function ve(e,t){const n=b.get(e);if(n)for(const i of n)i(t)}function ft(e,t){const n=Ee();n&&n.postMessage({key:e,fid:t}),Ae()}let g=null;function Ee(){return!g&&"BroadcastChannel"in self&&(g=new BroadcastChannel("[Firebase] FID Change"),g.onmessage=e=>{ve(e.data.key,e.data.fid)}),g}function Ae(){b.size===0&&g&&(g.close(),g=null)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const lt="firebase-installations-database",pt=1,w="firebase-installations-store";let F=null;function U(){return F||(F=q(lt,pt,{upgrade:(e,t)=>{switch(t){case 0:e.createObjectStore(w)}}})),F}async function N(e,t){const n=m(e),o=(await U()).transaction(w,"readwrite"),r=o.objectStore(w),a=await r.get(n);return await r.put(t,n),await o.done,(!a||a.fid!==t.fid)&&ke(e,t.fid),t}async function _e(e){const t=m(e),i=(await U()).transaction(w,"readwrite");await i.objectStore(w).delete(t),await i.done}async function O(e,t){const n=m(e),o=(await U()).transaction(w,"readwrite"),r=o.objectStore(w),a=await r.get(n),u=t(a);return u===void 0?await r.delete(n):await r.put(u,n),await o.done,u&&(!a||a.fid!==u.fid)&&ke(e,u.fid),u}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function B(e){let t;const n=await O(e.appConfig,i=>{const o=gt(i),r=ht(e,o);return t=r.registrationPromise,r.installationEntry});return n.fid===$?{installationEntry:await t}:{installationEntry:n,registrationPromise:t}}function gt(e){const t=e||{fid:st(),registrationStatus:0};return Re(t)}function ht(e,t){if(t.registrationStatus===0){if(!navigator.onLine){const o=Promise.reject(h.create("app-offline"));return{installationEntry:t,registrationPromise:o}}const n={fid:t.fid,registrationStatus:1,registrationTime:Date.now()},i=wt(e,n);return{installationEntry:n,registrationPromise:i}}else return t.registrationStatus===1?{installationEntry:t,registrationPromise:bt(e)}:{installationEntry:t}}async function wt(e,t){try{const n=await ot(e,t);return N(e.appConfig,n)}catch(n){throw we(n)&&n.customData.serverCode===409?await _e(e.appConfig):await N(e.appConfig,{fid:t.fid,registrationStatus:0}),n}}async function bt(e){let t=await Q(e.appConfig);for(;t.registrationStatus===1;)await Se(100),t=await Q(e.appConfig);if(t.registrationStatus===0){const{installationEntry:n,registrationPromise:i}=await B(e);return i||n}return t}function Q(e){return O(e,t=>{if(!t)throw h.create("installation-not-found");return Re(t)})}function Re(e){return yt(e)?{fid:e.fid,registrationStatus:0}:e}function yt(e){return e.registrationStatus===1&&e.registrationTime+pe<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function mt({appConfig:e,heartbeatServiceProvider:t},n){const i=Tt(e,n),o=tt(e,n),r=t.getImmediate({optional:!0});if(r){const s=await r.getHeartbeatsHeader();s&&o.append("x-firebase-client",s)}const a={installation:{sdkVersion:ge,appId:e.appId}},u={method:"POST",headers:o,body:JSON.stringify(a)},d=await Ie(()=>fetch(i,u));if(d.ok){const s=await d.json();return ye(s)}else throw await me("Generate Auth Token",d)}function Tt(e,{fid:t}){return`${be(e)}/${t}/authTokens:generate`}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function V(e,t=!1){let n;const i=await O(e.appConfig,r=>{if(!Ce(r))throw h.create("not-registered");const a=r.authToken;if(!t&&kt(a))return r;if(a.requestStatus===1)return n=It(e,t),r;{if(!navigator.onLine)throw h.create("app-offline");const u=Et(r);return n=St(e,u),u}});return n?await n:i.authToken}async function It(e,t){let n=await X(e.appConfig);for(;n.authToken.requestStatus===1;)await Se(100),n=await X(e.appConfig);const i=n.authToken;return i.requestStatus===0?V(e,t):i}function X(e){return O(e,t=>{if(!Ce(t))throw h.create("not-registered");const n=t.authToken;return At(n)?{...t,authToken:{requestStatus:0}}:t})}async function St(e,t){try{const n=await mt(e,t),i={...t,authToken:n};return await N(e.appConfig,i),n}catch(n){if(we(n)&&(n.customData.serverCode===401||n.customData.serverCode===404))await _e(e.appConfig);else{const i={...t,authToken:{requestStatus:0}};await N(e.appConfig,i)}throw n}}function Ce(e){return e!==void 0&&e.registrationStatus===2}function kt(e){return e.requestStatus===2&&!vt(e)}function vt(e){const t=Date.now();return t<e.creationTime||e.creationTime+e.expiresIn<t+Qe}function Et(e){const t={requestStatus:1,requestTime:Date.now()};return{...e,authToken:t}}function At(e){return e.requestStatus===1&&e.requestTime+pe<Date.now()}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function _t(e){const t=e,{installationEntry:n,registrationPromise:i}=await B(t);return i?i.catch(console.error):V(t).catch(console.error),n.fid}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Rt(e,t=!1){const n=e;return await Ct(n),(await V(n,t)).token}async function Ct(e){const{registrationPromise:t}=await B(e);t&&await t}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Nt(e,t){const{appConfig:n}=e;return ut(n,t),()=>{dt(n,t)}}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Dt(e){if(!e||!e.options)throw M("App Configuration");if(!e.name)throw M("App Name");const t=["projectId","apiKey","appId"];for(const n of t)if(!e.options[n])throw M(n);return{appName:e.name,projectId:e.options.projectId,apiKey:e.options.apiKey,appId:e.options.appId}}function M(e){return h.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Ne="installations",Ot="installations-internal",Ft=e=>{const t=e.getProvider("app").getImmediate(),n=Dt(t),i=L(t,"heartbeat");return{app:t,appConfig:n,heartbeatServiceProvider:i,_delete:()=>Promise.resolve()}},Mt=e=>{const t=e.getProvider("app").getImmediate(),n=L(t,Ne).getImmediate();return{getId:()=>_t(n),getToken:o=>Rt(n,o)}};function Pt(){R(new C(Ne,Ft,"PUBLIC")),R(new C(Ot,Mt,"PRIVATE"))}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */Pt();_(le,H);_(le,H,"esm2020");/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Kt="/firebase-messaging-sw.js",xt="/firebase-cloud-messaging-push-scope",De="BDOU99-h67HcA6JeFXHbSNMu7e2yNNu3RzoMj8TM4W88jITfq7ZmPvIM1Iv-4_l2LxQcYwhqby2xGpWwzjfAnG4",$t="https://fcmregistrations.googleapis.com/v1",Oe="google.c.a.c_id",jt="google.c.a.c_l",qt="google.c.a.ts",Lt="google.c.a.e",Z=1e4;var ee;(function(e){e[e.DATA_MESSAGE=1]="DATA_MESSAGE",e[e.DISPLAY_NOTIFICATION=3]="DISPLAY_NOTIFICATION"})(ee||(ee={}));/**
 * @license
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */var y;(function(e){e.PUSH_RECEIVED="push-received",e.NOTIFICATION_CLICKED="notification-clicked",e.FID_REGISTERED="fid-registered"})(y||(y={}));/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function f(e){const t=new Uint8Array(e);return btoa(String.fromCharCode(...t)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_")}function Fe(e){const t="=".repeat((4-e.length%4)%4),n=(e+t).replace(/\-/g,"+").replace(/_/g,"/"),i=atob(n),o=new Uint8Array(i.length);for(let r=0;r<i.length;++r)o[r]=i.charCodeAt(r);return o}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const P="fcm_token_details_db",Ht=5,te="fcm_token_object_Store";async function Ut(e){if("databases"in indexedDB&&!(await indexedDB.databases()).map(r=>r.name).includes(P))return null;let t=null;return(await q(P,Ht,{upgrade:async(i,o,r,a)=>{if(o<2||!i.objectStoreNames.contains(te))return;const u=a.objectStore(te),d=await u.index("fcmSenderId").get(e);if(await u.clear(),!!d){if(o===2){const s=d;if(!s.auth||!s.p256dh||!s.endpoint)return;t={token:s.fcmToken,createTime:s.createTime??Date.now(),subscriptionOptions:{auth:s.auth,p256dh:s.p256dh,endpoint:s.endpoint,swScope:s.swScope,vapidKey:typeof s.vapidKey=="string"?s.vapidKey:f(s.vapidKey)}}}else if(o===3){const s=d;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:f(s.auth),p256dh:f(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:f(s.vapidKey)}}}else if(o===4){const s=d;t={token:s.fcmToken,createTime:s.createTime,subscriptionOptions:{auth:f(s.auth),p256dh:f(s.p256dh),endpoint:s.endpoint,swScope:s.swScope,vapidKey:f(s.vapidKey)}}}}}})).close(),await A(P),await A("fcm_vapid_details_db"),await A("undefined"),Bt(t)?t:null}function Bt(e){if(!e||!e.subscriptionOptions)return!1;const{subscriptionOptions:t}=e;return typeof e.createTime=="number"&&e.createTime>0&&typeof e.token=="string"&&e.token.length>0&&typeof t.auth=="string"&&t.auth.length>0&&typeof t.p256dh=="string"&&t.p256dh.length>0&&typeof t.endpoint=="string"&&t.endpoint.length>0&&typeof t.swScope=="string"&&t.swScope.length>0&&typeof t.vapidKey=="string"&&t.vapidKey.length>0}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Vt={"missing-app-config-values":'Missing App configuration value: "{$valueName}"',"only-available-in-window":"This method is available in a Window context.","only-available-in-sw":"This method is available in a service worker context.","permission-default":"The notification permission was not granted and dismissed instead.","permission-blocked":"The notification permission was not granted and blocked instead.","unsupported-browser":"This browser doesn't support the API's required to use the Firebase SDK.","indexed-db-unsupported":"This browser doesn't support indexedDb.open() (ex. Safari iFrame, Firefox Private Browsing, etc)","failed-service-worker-registration":"We are unable to register the default service worker. {$browserErrorMessage}","token-subscribe-failed":"A problem occurred while subscribing the user to FCM: {$errorInfo}","token-subscribe-no-token":"FCM returned no token when subscribing the user to push.","fid-registration-failed":"A problem occurred while creating an FCM registration via FID: {$errorInfo}","fid-unregister-failed":"A problem occurred while unregistering the FCM registration via FID: {$errorInfo}","fid-registration-idb-schema-unavailable":"Unable to read or persist FID registration metadata because the messaging IndexedDB schema is unavailable (for example, the database could not be upgraded to the latest version).","token-unsubscribe-failed":"A problem occurred while unsubscribing the user from FCM: {$errorInfo}","token-update-failed":"A problem occurred while updating the user from FCM: {$errorInfo}","token-update-no-token":"FCM returned no token when updating the user to push.","use-sw-after-get-token":"The useServiceWorker() method may only be called once and must be called before calling getToken() to ensure your service worker is used.","invalid-sw-registration":"The input to useServiceWorker() must be a ServiceWorkerRegistration.","invalid-bg-handler":"The input to setBackgroundMessageHandler() must be a function.","invalid-vapid-key":"The public VAPID key must be a string.","use-vapid-key-after-get-token":"The usePublicVapidKey() method may only be called once and must be called before calling getToken() to ensure your VAPID key is used.","invalid-on-registered-handler":"No onRegistered callback handler was provided or registered. Implement onRegistered() before register()."},c=new fe("messaging","Messaging",Vt);/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ne="firebase-messaging-database",ie=2,p="firebase-messaging-store",l="firebase-messaging-fid-registration-store",Wt={openDB:q,deleteDB:A};let oe=Wt,k=null;function Gt(e,t,n){switch(t){case 0:if(e.createObjectStore(p),n===1)break;case 1:n===2&&e.createObjectStore(l)}}function re(e){return{upgrade:(t,n)=>{Gt(t,n,e)},blocked:()=>{},blocking:(t,n,i)=>{var o;k=null,(o=i.target)==null||o.close()},terminated:()=>{k=null}}}function T(){return k||(k=oe.openDB(ne,ie,re(2)).catch(()=>oe.openDB(ne,ie-1,re(1)))),k}function Me(e,t){return e.objectStoreNames.contains(t)}function W(e){if(!Me(e,l))throw c.create("fid-registration-idb-schema-unavailable")}async function Pe(e){const t=I(e),i=await(await T()).transaction(p).objectStore(p).get(t);if(i)return i;{const o=await Ut(e.appConfig.senderId);if(o)return await G(e,o),o}}async function G(e,t){const n=I(e),i=await T(),o=[p],r=Me(i,l);r&&o.push(l);const a=i.transaction(o,"readwrite");return await a.objectStore(p).put(t,n),r&&await a.objectStore(l).delete(n),await a.done,t}async function Jt(e){const t=I(e),i=(await T()).transaction(p,"readwrite");await i.objectStore(p).delete(t),await i.done}async function J(e){const t=I(e),n=await T();return W(n),await n.transaction(l).objectStore(l).get(t)}async function zt(e,t){const n=I(e),i=await T();W(i);const o=i.transaction([p,l],"readwrite");return await o.objectStore(l).put(t,n),await o.objectStore(p).delete(n),await o.done,t}async function Yt(e){const t=I(e),n=await T();W(n);const i=n.transaction(l,"readwrite");await i.objectStore(l).delete(t),await i.done}function I({appConfig:e}){return e.appId}const ae="@firebase/messaging",j="0.13.1";/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const Qt=3,Xt=1e3;async function Zt(e,t){const n=await E(e),i=z(t,e.appConfig.appName,!1),o={method:"POST",headers:n,body:JSON.stringify(i)};let r;try{r=await(await fetch(v(e.appConfig),o)).json()}catch(a){throw c.create("token-subscribe-failed",{errorInfo:a==null?void 0:a.toString()})}if(r.error){const a=r.error.message;throw c.create("token-subscribe-failed",{errorInfo:a})}if(!r.token)throw c.create("token-subscribe-no-token");return r.token}async function en(e,t){var d;const n=await E(e),i=z(t,e.appConfig.appName,!0),o={method:"POST",headers:n,body:JSON.stringify(i)};let r;try{r=await an(()=>fetch(v(e.appConfig),o),Qt,Xt)}catch(s){throw c.create("fid-registration-failed",{errorInfo:s==null?void 0:s.toString()})}if(r.ok)return{responseFid:await nn(r)};let a;try{a=await r.json()}catch{throw c.create("fid-registration-failed",{errorInfo:r.statusText})}const u=((d=a.error)==null?void 0:d.message)??r.statusText;throw c.create("fid-registration-failed",{errorInfo:u})}async function tn(e,t){var r;const i={method:"DELETE",headers:await E(e)};let o;try{o=await fetch(`${v(e.appConfig)}/${t}`,i)}catch(a){throw c.create("fid-unregister-failed",{errorInfo:a==null?void 0:a.toString()})}if(!o.ok)try{throw((r=(await o.json()).error)==null?void 0:r.message)??o.statusText}catch(a){throw c.create("fid-unregister-failed",{errorInfo:typeof a=="string"&&a||o.statusText||(a==null?void 0:a.toString())})}}async function nn(e){const t=await e.text();if(!t.trim())throw c.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response body is empty"});let n;try{n=JSON.parse(t)}catch{throw c.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response body is not valid JSON"})}const i=n.name;if(typeof i!="string"||i.length===0)throw c.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response did not include a non-empty name"});return on(i)}const se="/registrations/";function on(e){const t=e.indexOf(se);if(t!==-1){const n=e.slice(t+se.length);if(n.length>0)return n}throw c.create("fid-registration-failed",{errorInfo:"CreateRegistration succeeded but response name is not a valid registration resource name"})}async function rn(e,t){const n=await E(e),i=z(t.subscriptionOptions,e.appConfig.appName,!1),o={method:"PATCH",headers:n,body:JSON.stringify(i)};let r;try{r=await(await fetch(`${v(e.appConfig)}/${t.token}`,o)).json()}catch(a){throw c.create("token-update-failed",{errorInfo:a==null?void 0:a.toString()})}if(r.error){const a=r.error.message;throw c.create("token-update-failed",{errorInfo:a})}if(!r.token)throw c.create("token-update-no-token");return r.token}async function Ke(e,t){const i={method:"DELETE",headers:await E(e)};try{const r=await(await fetch(`${v(e.appConfig)}/${t}`,i)).json();if(r.error){const a=r.error.message;throw c.create("token-unsubscribe-failed",{errorInfo:a})}}catch(o){throw c.create("token-unsubscribe-failed",{errorInfo:o==null?void 0:o.toString()})}}async function an(e,t,n){let i;for(let o=0;o<t;o++)try{return await e()}catch(r){if(i=r,o<t-1){const a=n*Math.pow(2,o);await new Promise(u=>setTimeout(u,a))}}throw i}function v({projectId:e}){return`${$t}/projects/${e}/registrations`}async function E({appConfig:e,installations:t}){const n=await t.getToken();return new Headers({"Content-Type":"application/json",Accept:"application/json","x-goog-api-key":e.apiKey,"x-goog-firebase-installations-auth":`FIS ${n}`})}function sn(e,t){var n,i;try{if(/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(e))return new URL(e).host}catch{}try{if(typeof self<"u"&&((n=self.location)!=null&&n.href))return new URL(e,self.location.origin).host}catch{}return typeof self<"u"&&((i=self.location)!=null&&i.host)?self.location.host:t}function z({p256dh:e,auth:t,endpoint:n,vapidKey:i,swScope:o},r,a){const u={web:{origin:sn(o,r),endpoint:n,auth:t,p256dh:e}};return a&&(u.fcm_sdk_version=j),i!==De&&(u.web.applicationPubKey=i),u}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const cn=7*24*60*60*1e3;async function un(e){const t=await gn(e.swRegistration,e.vapidKey),n={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:t.endpoint,auth:f(t.getKey("auth")),p256dh:f(t.getKey("p256dh"))},i=await Pe(e.firebaseDependencies);if(i){if(hn(i.subscriptionOptions,n))return Date.now()>=i.createTime+cn?pn(e,{token:i.token,createTime:Date.now(),subscriptionOptions:n}):i.token;try{await Ke(e.firebaseDependencies,i.token)}catch(o){console.warn(o)}return ce(e.firebaseDependencies,n)}else return ce(e.firebaseDependencies,n)}async function dn(e,t){await Ke(e.firebaseDependencies,t.token),await Jt(e.firebaseDependencies),await xe(e.firebaseDependencies)}async function fn(e){const t=await J(e.firebaseDependencies).catch(()=>{}),n=t==null?void 0:t.fid;n&&await tn(e.firebaseDependencies,n),await xe(e.firebaseDependencies),n&&bn(e,n)}async function ln(e){const t=await Pe(e.firebaseDependencies);t?await dn(e,t):await fn(e);const n=await e.swRegistration.pushManager.getSubscription();return n?n.unsubscribe():!0}async function pn(e,t){try{const n=await rn(e.firebaseDependencies,t),i={...t,token:n,createTime:Date.now()};return await G(e.firebaseDependencies,i),n}catch(n){throw n}}async function ce(e,t){const i={token:await Zt(e,t),createTime:Date.now(),subscriptionOptions:t};return await G(e,i),i.token}async function gn(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:Fe(t)})}function hn(e,t){const n=t.vapidKey===e.vapidKey,i=t.endpoint===e.endpoint,o=t.auth===e.auth,r=t.p256dh===e.p256dh;return n&&i&&o&&r}async function xe(e){try{await Yt(e)}catch{}}function wn(e,t){const n=e.onRegisteredHandler;n&&(typeof n=="function"?n(t):n.next(t))}function bn(e,t){const n=e.onUnregisteredHandler;n&&(typeof n=="function"?n(t):n.next(t))}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function $e(e){try{e.swRegistration=await navigator.serviceWorker.register(Kt,{scope:xt}),e.swRegistration.update().catch(()=>{}),await yn(e.swRegistration)}catch(t){throw c.create("failed-service-worker-registration",{browserErrorMessage:t==null?void 0:t.message})}}async function yn(e){return new Promise((t,n)=>{const i=setTimeout(()=>n(new Error(`Service worker not registered after ${Z} ms`)),Z),o=e.installing||e.waiting;e.active?(clearTimeout(i),t()):o?o.onstatechange=r=>{var a;((a=r.target)==null?void 0:a.state)==="activated"&&(o.onstatechange=null,clearTimeout(i),t())}:(clearTimeout(i),n(new Error("No incoming service worker found.")))})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function je(e,t){if(!t&&!e.swRegistration&&await $e(e),!(!t&&e.swRegistration)){if(!(t instanceof ServiceWorkerRegistration))throw c.create("invalid-sw-registration");e.swRegistration=t}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function qe(e,t){t?e.vapidKey=t:e.vapidKey||(e.vapidKey=De)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const ue=3;async function mn(e,t){const n=await Tn(e.swRegistration,e.vapidKey),i={vapidKey:e.vapidKey,swScope:e.swRegistration.scope,endpoint:n.endpoint,auth:f(n.getKey("auth")),p256dh:f(n.getKey("p256dh"))},o=e.firebaseDependencies.installations;for(let r=0;r<ue;r++){const{responseFid:a}=await en(e.firebaseDependencies,i);if(a===t)return;r<ue-1&&await o.getToken(!0)}throw c.create("fid-registration-failed",{errorInfo:"CreateRegistration response FID does not match Firebase Installation ID"})}async function Tn(e,t){const n=await e.pushManager.getSubscription();return n||e.pushManager.subscribe({userVisibleOnly:!0,applicationServerKey:Fe(t)})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const In=7*24*60*60*1e3;async function Le(e,t){if(!navigator)throw c.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw c.create("permission-blocked");if(!e.onRegisteredHandler)throw c.create("invalid-on-registered-handler");await qe(e,t==null?void 0:t.vapidKey),await je(e,t==null?void 0:t.serviceWorkerRegistration);const n=e._registerNotifyChain.catch(()=>{});return e._registerNotifyChain=n.then(async()=>{const i=await e.firebaseDependencies.installations.getId(),o=await J(e.firebaseDependencies),r=Date.now();if((!o||o.fid!==i||r>=o.lastRegisterTime+In)&&(await mn(e,i),await zt(e.firebaseDependencies,{fid:i,lastRegisterTime:r,vapidKey:e.vapidKey})),!e.onRegisteredHandler)throw c.create("invalid-on-registered-handler");wn(e,i)}),e._registerNotifyChain}/**
 * @license
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Sn(e,t){return Nt(t,()=>{(async()=>!e.onRegisteredHandler||!await J(e.firebaseDependencies)||await Le(e).catch(()=>{}))()})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function de(e){const t={from:e.from,collapseKey:e.collapse_key,messageId:e.fcmMessageId};return kn(t,e),vn(t,e),En(t,e),t}function kn(e,t){if(!t.notification)return;e.notification={};const n=t.notification.title;n&&(e.notification.title=n);const i=t.notification.body;i&&(e.notification.body=i);const o=t.notification.image;o&&(e.notification.image=o);const r=t.notification.icon;r&&(e.notification.icon=r)}function vn(e,t){t.data&&(e.data=t.data)}function En(e,t){var o,r,a,u;if(!t.fcmOptions&&!((o=t.notification)!=null&&o.click_action))return;e.fcmOptions={};const n=((r=t.fcmOptions)==null?void 0:r.link)??((a=t.notification)==null?void 0:a.click_action);n&&(e.fcmOptions.link=n);const i=(u=t.fcmOptions)==null?void 0:u.analytics_label;i&&(e.fcmOptions.analyticsLabel=i)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function An(e){return typeof e=="object"&&!!e&&Oe in e}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function _n(e){if(!e||!e.options)throw K("App Configuration Object");if(!e.name)throw K("App Name");const t=["projectId","apiKey","appId","messagingSenderId"],{options:n}=e;for(const i of t)if(!n[i])throw K(i);return{appName:e.name,projectId:n.projectId,apiKey:n.apiKey,appId:n.appId,senderId:n.messagingSenderId}}function K(e){return c.create("missing-app-config-values",{valueName:e})}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */class Rn{constructor(t,n,i){this.deliveryMetricsExportedToBigQueryEnabled=!1,this.onBackgroundMessageHandler=null,this.onMessageHandler=null,this.onRegisteredHandler=null,this.onUnregisteredHandler=null,this._registerNotifyChain=Promise.resolve(),this._fidChangeUnsubscribe=null,this.logEvents=[],this.logQueue={state:"stopped"};const o=_n(t);this.firebaseDependencies={app:t,appConfig:o,installations:n,analyticsProvider:i}}_delete(){return this._fidChangeUnsubscribe&&(this._fidChangeUnsubscribe(),this._fidChangeUnsubscribe=null),this.logQueue.state==="scheduled"&&clearTimeout(this.logQueue.timerId),this.logQueue={state:"stopped"},Promise.resolve()}}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function He(e,t){if(!navigator)throw c.create("only-available-in-window");if(Notification.permission==="default"&&await Notification.requestPermission(),Notification.permission!=="granted")throw c.create("permission-blocked");return await qe(e,t==null?void 0:t.vapidKey),await je(e,t==null?void 0:t.serviceWorkerRegistration),un(e)}/**
 * @license
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Cn(e,t,n){const i=Nn(t);(await e.firebaseDependencies.analyticsProvider.get()).logEvent(i,{message_id:n[Oe],message_name:n[jt],message_time:n[qt],message_device_time:Math.floor(Date.now()/1e3)})}function Nn(e){switch(e){case y.NOTIFICATION_CLICKED:return"notification_open";case y.PUSH_RECEIVED:return"notification_foreground";default:throw new Error}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Dn(e,t){const n=t.data;if(!n.isFirebaseMessaging)return;if(e.onMessageHandler&&n.messageType===y.PUSH_RECEIVED&&(typeof e.onMessageHandler=="function"?e.onMessageHandler(de(n)):e.onMessageHandler.next(de(n))),e.onRegisteredHandler&&n.messageType===y.FID_REGISTERED){const o=n.fid;typeof e.onRegisteredHandler=="function"?e.onRegisteredHandler(o):e.onRegisteredHandler.next(o)}const i=n.data;An(i)&&i[Lt]==="1"&&await Cn(e,n.messageType,i)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const On=e=>{const t=new Rn(e.getProvider("app").getImmediate(),e.getProvider("installations-internal").getImmediate(),e.getProvider("analytics-internal"));return navigator.serviceWorker.addEventListener("message",n=>Dn(t,n)),t._fidChangeUnsubscribe=Sn(t,e.getProvider("installations").getImmediate()),t},Fn=e=>{const t=e.getProvider("messaging").getImmediate();return{getToken:i=>He(t,i),register:i=>Le(t,i)}};function Mn(){R(new C("messaging",On,"PUBLIC")),R(new C("messaging-internal",Fn,"PRIVATE")),_(ae,j),_(ae,j,"esm2020")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function S(){try{await We()}catch{return!1}return typeof window<"u"&&Ge()&&Je()&&"serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window&&"fetch"in window&&ServiceWorkerRegistration.prototype.hasOwnProperty("showNotification")&&PushSubscription.prototype.hasOwnProperty("getKey")}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */async function Pn(e){if(!navigator)throw c.create("only-available-in-window");return e.swRegistration||await $e(e),ln(e)}/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function Kn(e,t){if(!navigator)throw c.create("only-available-in-window");return e.onMessageHandler=t,()=>{e.onMessageHandler=null}}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */function x(e=ze()){return S().then(t=>{if(!t)throw c.create("unsupported-browser")},t=>{throw c.create("indexed-db-unsupported")}),L(D(e),"messaging").getImmediate()}async function xn(e,t){return e=D(e),He(e,t)}function $n(e){return e=D(e),Pn(e)}function jn(e,t){return e=D(e),Kn(e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */Mn();class Y extends Be{constructor(){super(),S().then(t=>{if(!t)return;const n=x();jn(n,i=>this.handleNotificationReceived(i))})}async checkPermissions(){return await S()?{receive:this.convertNotificationPermissionToPermissionState(Notification.permission)}:{receive:"denied"}}async requestPermissions(){if(!await S())return{receive:"denied"};const n=await Notification.requestPermission();return{receive:this.convertNotificationPermissionToPermissionState(n)}}async isSupported(){return{isSupported:await S()}}async getToken(t){const n=x();return{token:await xn(n,{vapidKey:t.vapidKey,serviceWorkerRegistration:t.serviceWorkerRegistration})}}async deleteToken(){const t=x();await $n(t)}async getDeliveredNotifications(){this.throwUnimplementedError()}async removeDeliveredNotifications(t){this.throwUnimplementedError()}async removeAllDeliveredNotifications(){this.throwUnimplementedError()}async subscribeToTopic(t){this.throwUnimplementedError()}async unsubscribeFromTopic(t){this.throwUnimplementedError()}async createChannel(t){this.throwUnimplementedError()}async deleteChannel(t){this.throwUnimplementedError()}async listChannels(){this.throwUnimplementedError()}handleNotificationReceived(t){const i={notification:this.createNotificationResult(t)};this.notifyListeners(Y.notificationReceivedEvent,i)}createNotificationResult(t){var n,i,o;return{body:(n=t.notification)===null||n===void 0?void 0:n.body,data:t.data,id:t.messageId,image:(i=t.notification)===null||i===void 0?void 0:i.image,title:(o=t.notification)===null||o===void 0?void 0:o.title}}convertNotificationPermissionToPermissionState(t){let n="prompt";switch(t){case"granted":n="granted";break;case"denied":n="denied";break}return n}throwUnimplementedError(){throw this.unimplemented("Not implemented on web.")}}Y.notificationReceivedEvent="notificationReceived";export{Y as FirebaseMessagingWeb};
