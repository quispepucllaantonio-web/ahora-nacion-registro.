let token=localStorage.getItem('an_token')||'';
const $=id=>document.getElementById(id);
function api(url,opt={}){opt.headers={...(opt.headers||{}),Authorization:'Bearer '+token,'Content-Type':'application/json'};return fetch(url,opt).then(async r=>{const j=await r.json().catch(()=>({}));if(r.status===401){logout();throw new Error('Sesión expirada')}if(!r.ok)throw new Error(j.error||'Error');return j})}
function showPanel(){ $('login').classList.add('hidden');$('panel').classList.remove('hidden');loadAll()}
function logout(){localStorage.removeItem('an_token');token='';$('panel').classList.add('hidden');$('login').classList.remove('hidden')}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginMsg').textContent='';try{const j=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:$('username').value,password:$('password').value})}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error);return j});token=j.token;localStorage.setItem('an_token',token);showPanel()}catch(err){$('loginMsg').textContent=err.message}});
$('logout').onclick=logout;
async function loadAll(){await loadStats();await loadCampaigns();await loadRows()}
async function loadStats(){const j=await api('/api/admin/stats');$('total').textContent=j.totalRegistrations;$('today').textContent=j.todayRegistrations;$('campaignCount').textContent=j.activeCampaigns}
async function loadCampaigns(){const j=await api('/api/admin/campaigns');$('campaignFilter').innerHTML='<option value="">Todas las campañas</option>'+j.map(c=>`<option value="${c.id}">${esc(c.title)}</option>`).join('');$('campaigns').innerHTML=j.map(c=>`<div class="campaign"><button class="small" onclick="editCampaign(${c.id})">Editar</button><b>${esc(c.title)}</b><br><small>/c/${esc(c.slug)} · ${c.total_registros} registros · ${c.is_active?'ACTIVA':'INACTIVA'}</small></div>`).join('')}
async function loadRows(){const p=new URLSearchParams();if($('search').value)p.set('search',$('search').value);if($('campaignFilter').value)p.set('campaign_id',$('campaignFilter').value);if($('communityFilter').value)p.set('comunidad',$('communityFilter').value);const j=await api('/api/admin/registrations?'+p);$('rows').innerHTML=j.map(r=>`<tr><td><b>${esc(r.reg_number)}</b></td><td>${esc(r.nombres+' '+r.apellido_paterno+' '+r.apellido_materno)}</td><td>${esc(r.dni||'-')}</td><td>${esc(r.celular)}</td><td>${esc(r.comunidad)}</td><td>${esc(r.campaign_title)}</td><td>${esc(r.fecha_registro)} ${esc(r.hora_registro)}</td><td><span class="status ${r.estado==='ACTIVO'?'':'off'}">${r.estado}</span></td><td><button class="small" onclick="editReg(${r.id})">Editar</button></td></tr>`).join('')}
$('searchBtn').onclick=loadRows;
$('campaignFilter').onchange=loadRows;
$('excelBtn').onclick=()=>download('/api/admin/export/excel');
$('csvBtn').onclick=()=>download('/api/admin/export/csv');
function download(url){fetch(url,{headers:{Authorization:'Bearer '+token}}).then(async r=>{if(!r.ok)throw new Error('No se pudo exportar');const b=await r.blob();const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=r.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'exportacion';a.click()})}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
async function editReg(id){
  const rows = await api('/api/admin/registrations');
  const r = rows.find(x => x.id === id);
  if(!r) return;

  openModal(`
    <h2>Editar registro ${esc(r.reg_number)}</h2>

    <form id="editRegForm">

      <div class="field full">
        <label>Nombres
          <input name="nombres" value="${esc(r.nombres)}" required>
        </label>
      </div>

      <div class="field">
        <label>Apellido paterno
          <input name="apellido_paterno" value="${esc(r.apellido_paterno)}" required>
        </label>
      </div>

      <div class="field">
        <label>Apellido materno
          <input name="apellido_materno" value="${esc(r.apellido_materno)}" required>
        </label>
      </div>

      <div class="field full">
        <label class="check">
          <input type="checkbox" name="tiene_dni" id="edit_tiene_dni" ${r.tiene_dni ? 'checked' : ''}>
          <span>¿Cuenta con DNI?</span>
        </label>
      </div>

      <div class="field full" id="edit_dniWrap" style="display:${r.tiene_dni ? 'block' : 'none'}">
        <label>DNI
          <input
            name="dni"
            id="edit_dni"
            value="${esc(r.dni || '')}"
            inputmode="numeric"
            maxlength="8"
            placeholder="12345678"
          >
        </label>
      </div>

      <div class="field full">
        <label>Celular
          <input name="celular" value="${esc(r.celular)}" required>
        </label>
      </div>

      <div class="field full">
        <label>Comunidad
          <input name="comunidad" value="${esc(r.comunidad)}" required>
        </label>
      </div>

      <div class="field full">
        <label>Observaciones
          <textarea name="observaciones">${esc(r.observaciones || '')}</textarea>
        </label>
      </div>

      <div class="field full">
        <label>Estado
          <select name="estado">
            <option value="ACTIVO" ${r.estado === 'ACTIVO' ? 'selected' : ''}>ACTIVO</option>
            <option value="INACTIVO" ${r.estado === 'INACTIVO' ? 'selected' : ''}>INACTIVO</option>
          </select>
        </label>
      </div>

      <button>Guardar</button>
    </form>
  `);

  const form = document.getElementById('editRegForm');
  const tieneDni = document.getElementById('edit_tiene_dni');
  const dniWrap = document.getElementById('edit_dniWrap');
  const dni = document.getElementById('edit_dni');

  const actualizarDni = () => {
    dniWrap.style.display = tieneDni.checked ? 'block' : 'none';
    dni.required = tieneDni.checked;

    if(!tieneDni.checked){
      dni.value = '';
    }
  };

  tieneDni.addEventListener('change', actualizarDni);
  actualizarDni();

  form.onsubmit = async e => {
    e.preventDefault();

    const d = Object.fromEntries(new FormData(e.currentTarget));
    d.tiene_dni = tieneDni.checked;

    if(!d.tiene_dni){
      d.dni = '';
    }

    try{
      await api('/api/admin/registrations/' + id, {
        method: 'PUT',
        body: JSON.stringify(d)
      });

      closeModal();
      await loadAll();
    }catch(err){
      alert(err.message);
    }
  };
}
async function editCampaign(id){const cs=await api('/api/admin/campaigns');const c=cs.find(x=>x.id===id);openCampaign(c)}
$('newCampaign').onclick=()=>openCampaign(null);
function openCampaign(c){openModal(`<h2>${c?'Editar':'Nueva'} campaña</h2><form id="campForm"><label>Encabezado<input name="header_text" value="${esc(c?.header_text||'AHORA NACIÓN')}"></label><label>Título<input name="title" value="${esc(c?.title||'')} " required></label><label>Descripción<textarea name="description">${esc(c?.description||'')}</textarea></label><label>Categoría<input name="category" value="${esc(c?.category||'Inscripción')}"></label><label>Mensaje WhatsApp<textarea name="share_message" required>${esc(c?.share_message||'')}</textarea></label><label>OG título<input name="og_title" value="${esc(c?.og_title||'')}"></label><label>OG descripción<textarea name="og_description">${esc(c?.og_description||'')}</textarea></label><label>Activa <input type="checkbox" name="is_active" ${c?.is_active!==0?'checked':''}></label><button>Guardar</button></form>`);$('campForm').onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));d.is_active=e.currentTarget.is_active.checked;try{await api(c?'/api/admin/campaigns/'+c.id:'/api/admin/campaigns',{method:c?'PUT':'POST',body:JSON.stringify(d)});closeModal();await loadAll()}catch(err){alert(err.message)}}}
function openModal(html){$('modal').className='modal';$('modal').innerHTML=`<div class="modalBox">${html}<p><button type="button" onclick="closeModal()">Cerrar</button></p></div>`}
function closeModal(){$('modal').className='hidden';$('modal').innerHTML=''}
if(token){api('/api/admin/me').then(showPanel).catch(()=>{})}




