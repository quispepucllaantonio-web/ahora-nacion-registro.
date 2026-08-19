const app=document.getElementById('app');
const slug=app?.dataset?.slug || 'campana-general';
let campaign=null;

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}

async function load(){
  const r=await fetch('/api/public/campaign/'+encodeURIComponent(slug));
  if(!r.ok){app.innerHTML='<div class="card"><h2>No hay una campaña activa.</h2></div>';return}
  campaign=await r.json();
  render();
}
function render(){
  app.innerHTML=`
  <div class="hero">
    <img src="/ahora-nacion-logo.png" alt="Ahora Nación">
    <h1>${esc(campaign.title)}</h1>
    <p>${esc(campaign.description)}</p>
  </div>
  <main class="container">
    <div class="card">
      <div id="msg"></div>
      <form id="form">
        <div class="grid">
          <div class="field full"><label>Nombres *</label><input name="nombres" required autocomplete="given-name"></div>
          <div class="field"><label>Apellido paterno *</label><input name="apellido_paterno" required></div>
          <div class="field"><label>Apellido materno *</label><input name="apellido_materno" required></div>
          <div class="field full"><label>Celular *</label><input name="celular" inputmode="numeric" maxlength="9" placeholder="987654321" required></div>
          <div class="field full">
            <label class="check"><input id="tiene_dni" name="tiene_dni" type="checkbox"> <span>¿Cuenta con DNI?</span></label>
          </div>
          <div class="field full" id="dniWrap" style="display:none"><label>DNI</label><input id="dni" name="dni" inputmode="numeric" maxlength="8" placeholder="12345678"></div>
          <div class="field full"><label>Comunidad / localidad *</label><input name="comunidad" required placeholder="Ej. Mantaro"></div>
          <div class="field full"><label>Observaciones</label><textarea name="observaciones" placeholder="Información adicional (opcional)"></textarea></div>
        </div>
        <p class="note">Los campos marcados con * son obligatorios.</p>
        <button class="btn" id="submit">Registrar mis datos</button>
      </form>
    </div>
    <div class="footer">Sistema de registro · ${esc(campaign.header_text)}</div>
  </main>`;
  document.getElementById('tiene_dni').addEventListener('change',e=>{
    document.getElementById('dniWrap').style.display=e.target.checked?'block':'none';
    document.getElementById('dni').required=e.target.checked;
  });
  document.getElementById('form').addEventListener('submit',submit);
}
async function submit(e){
  e.preventDefault();
  const form=e.currentTarget, btn=document.getElementById('submit'), msg=document.getElementById('msg');
  msg.innerHTML='';btn.disabled=true;btn.textContent='Guardando...';
  const fd=new FormData(form), data=Object.fromEntries(fd.entries());
  data.campaign_id=campaign.id;data.tiene_dni=document.getElementById('tiene_dni').checked;
  try{
    const r=await fetch('/api/public/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const j=await r.json();
    if(!r.ok)throw new Error(j.error||'No se pudo registrar.');
    let share = String(j.share_message || "")
    .replace(/\\n/g, "\n")
    .replace(/\[ENLACE\]/g, location.href)
    .replace(/\[NUMERO\]/g, j.reg_number);

if (!share.includes(j.reg_number)) {
    share = share.trim() + "\nN.º de inscripción: " + j.reg_number;
}
msg.innerHTML=`
      <div class="success">
        <h2>¡Registro realizado!</h2>
        <p>Tu registro fue guardado correctamente.</p>
        <div class="code">${esc(j.reg_number)}</div>
        <p><b>Guarda este número.</b></p>
        <a class="share" target="_blank" href="https://wa.me/?text=${encodeURIComponent(share)}">Compartir por WhatsApp</a>
        <button class="btn" style="margin-top:12px" onclick="location.reload()">Nuevo registro</button>
      </div>`;
    form.style.display='none';
  }catch(err){msg.innerHTML='<div class="error">'+esc(err.message)+'</div>';btn.disabled=false;btn.textContent='Registrar mis datos'}
}
load();






