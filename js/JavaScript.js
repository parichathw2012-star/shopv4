<script>
const state = { page:'dashboard', scanner:null, selected:{topup:null,payment:null}, dashboard:null };

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  refreshDashboard();
});

function gas(name, ...args){
  return new Promise((resolve,reject)=>{
    if (!google || !google.script || !google.script.run) {
      reject(new Error('Google Apps Script API ไม่พร้อมใช้งาน'));
      return;
    }
    google.script.run.withSuccessHandler(resolve).withFailureHandler(e=>reject(new Error(e?.message || e)))[name](...args);
  });
}

function showPage(page){
  stopScanner();
  state.page=page;
  document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===`page-${page}`));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));
  if(page==='dashboard') refreshDashboard();
}

function money(v){return Number(v||0).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})}
function dt(v){try{return new Date(v).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'medium'})}catch(e){return '-'}}

async function refreshDashboard(){
  try{
    const d=await gas('getDashboard'); state.dashboard=d;
    document.getElementById('stat-members').textContent=`${d.memberCount.toLocaleString('th-TH')} คน`;
    document.getElementById('stat-balance').textContent=`฿${money(d.totalBalance)}`;
    document.getElementById('stat-payments').textContent=`${d.paymentCountToday.toLocaleString('th-TH')} รายการ`;
    document.getElementById('stat-sales').textContent=`฿${money(d.salesToday)}`;
    const body=document.getElementById('recent-body');
    body.innerHTML=d.recentTransactions.length?d.recentTransactions.map(t=>`<tr><td>${dt(t.dateTime)}</td><td>${esc(t.memberId)}</td><td>${esc(t.memberName)}</td><td><span class="badge ${t.type==='TOPUP'?'topup':'payment'}">${t.type==='TOPUP'?'เติมเงิน':'ชำระเงิน'}</span></td><td>฿${money(t.amount)}</td><td>฿${money(t.afterBalance)}</td></tr>`).join(''):`<tr><td colspan="6" class="empty">ยังไม่มีธุรกรรม</td></tr>`;
  }catch(e){showError(e)}
}

async function searchMembers(){
  const q=document.getElementById('member-search').value.trim();
  if(!q){Swal.fire('⚠️ กรุณาระบุคำค้น','กรอกรหัสสมาชิกหรือชื่อสมาชิก','warning');return}
  try{
    const list=await gas('searchMember',q);
    const el=document.getElementById('member-results');
    el.innerHTML=list.length?list.map(m=>memberRow(m,'members')).join(''):`<div class="empty">⚠️ ไม่พบสมาชิก</div>`;
  }catch(e){showError(e)}
}

function memberRow(m,target){
  return `<div class="member-row"><div><div class="member-name">${esc(m.fullName)}</div><div class="member-meta">รหัส ${esc(m.memberId)} • ${esc(m.classRoom)} • ${esc(m.status)}</div></div><div style="text-align:right"><div class="balance">฿${money(m.balance)}</div><button class="btn secondary" style="margin-top:5px" onclick='selectMember(${JSON.stringify(m)}, "${target}")'>เลือก</button></div></div>`;
}

async function selectBySearch(target){
  const q=document.getElementById(`${target}-search`).value.trim();
  if(!q){Swal.fire('⚠️ กรุณาระบุสมาชิก','กรอกรหัสสมาชิกหรือชื่อสมาชิก','warning');return}
  try{
    const list=await gas('searchMember',q);
    if(!list.length){Swal.fire('⚠️ ไม่พบสมาชิก','','warning');return}
    if(list.length===1) selectMember(list[0],target);
    else Swal.fire({title:'เลือกสมาชิก',html:`<div style="text-align:left">${list.slice(0,8).map(m=>`<button class="btn secondary" style="width:100%;margin:4px 0;justify-content:space-between" onclick='Swal.close();selectMember(${JSON.stringify(m)},"${target}")'><span>${esc(m.fullName)}<br><small>${esc(m.memberId)} • ${esc(m.classRoom)}</small></span><b>฿${money(m.balance)}</b></button>`).join('')}</div>`,showConfirmButton:false});
  }catch(e){showError(e)}
}

function selectMember(m,target){
  stopScanner();
  if(target==='members'){renderMemberDetail(m);return}
  state.selected[target]=m;
  renderTransactionWorkspace(target,m);
}

function renderMemberDetail(m){
  const p=document.getElementById('member-detail-panel');p.classList.remove('hidden');
  p.innerHTML=`<div class="detail-content"><div class="member-profile"><div class="avatar"><i class="fa-solid fa-user"></i></div><div><div class="profile-name">${esc(m.fullName)}</div><div class="profile-id">รหัสสมาชิก: ${esc(m.memberId)} • ชั้น: ${esc(m.classRoom)}</div><div style="font-size:12px;color:#15803d;margin-top:4px">● ${esc(m.status)}</div></div><div class="balance-box"><small>ยอดเงินคงเหลือ</small><strong>฿${money(m.balance)}</strong></div></div><div class="action-row"><button class="btn primary" onclick='jumpWithMember(${JSON.stringify(m)},"topup")'><i class="fa-solid fa-wallet"></i> เติมเงิน</button><button class="btn secondary" onclick='jumpWithMember(${JSON.stringify(m)},"payment")'><i class="fa-solid fa-cart-shopping"></i> ชำระเงิน</button><button class="btn secondary" onclick='showMemberCard(${JSON.stringify(m)})'><i class="fa-solid fa-id-card"></i> ดูบัตรสมาชิก</button></div></div>`;
  p.scrollIntoView({behavior:'smooth',block:'start'});
}

function jumpWithMember(m,target){showPage(target);selectMember(m,target)}

function renderTransactionWorkspace(target,m){
  const root=document.getElementById(`${target}-workspace`);
  const isTop=target==='topup';
  root.innerHTML=`<div class="workspace"><div class="member-summary"><div class="name">${esc(m.fullName)}</div><div class="meta">รหัส ${esc(m.memberId)} • ${esc(m.classRoom)}</div><div class="current">ยอดเงินปัจจุบัน ฿${money(m.balance)}</div></div><div class="amount-label">${isTop?'จำนวนเงินที่ต้องการเติม':'จำนวนเงินที่ชำระ'}</div><input id="${target}-amount" class="input amount-input" inputmode="decimal" type="number" min="0.01" step="0.01" placeholder="0.00" oninput="sanitizeAmount(this)">${isTop?`<div class="quick-grid">${[10,20,50,100,200,500].map(n=>`<button onclick="addAmount('${target}',${n})">+${n}</button>`).join('')}</div>`:`<div class="pay-grid">${[1,2,3,4,5,6,7,8,9,'.',0,'⌫'].map(k=>`<button class="pay-key" onclick="keyAmount('${target}','${k}')">${k}</button>`).join('')}</div>`}<button class="btn ${isTop?'primary':'primary'}" style="width:100%;margin-top:10px;padding:13px" onclick="confirmTransaction('${target}')"><i class="fa-solid ${isTop?'fa-wallet':'fa-cart-shopping'}"></i> ${isTop?'ยืนยันเติมเงิน':'ยืนยันชำระเงิน'}</button><button class="btn secondary" style="width:100%;margin-top:8px" onclick="clearTransaction('${target}')">สแกนสมาชิกคนต่อไป</button></div>`;
}

function sanitizeAmount(el){if(Number(el.value)<0)el.value='';}
function addAmount(target,n){const el=document.getElementById(`${target}-amount`);el.value=(Number(el.value)||0)+n}
function keyAmount(target,k){const el=document.getElementById(`${target}-amount`);if(k==='⌫'){el.value=el.value.slice(0,-1);return}if(k==='.'&&el.value.includes('.'))return;el.value+=k}
function clearTransaction(target){state.selected[target]=null;document.getElementById(`${target}-workspace`).innerHTML='<div class="empty">กรุณาระบุสมาชิกก่อน</div>'}

async function confirmTransaction(target){
  const m=state.selected[target]; const el=document.getElementById(`${target}-amount`);
  const amount=Number(el?.value);
  if(!m){Swal.fire('⚠️ ไม่พบสมาชิก','','warning');return}
  if(!Number.isFinite(amount)||amount<=0){Swal.fire('⚠️ จำนวนเงินไม่ถูกต้อง','กรุณาระบุจำนวนเงินมากกว่า 0','warning');return}
  if(target==='payment' && m.balance<amount){Swal.fire('❌ ยอดเงินไม่เพียงพอ',`ยอดเงินคงเหลือ: ฿${money(m.balance)}<br>ยอดที่ต้องชำระ: ฿${money(amount)}`,'error');return}
  const isTop=target==='topup', after=isTop?m.balance+amount:m.balance-amount;
  const result=await Swal.fire({title:isTop?'ยืนยันการเติมเงิน':'ยืนยันการชำระเงิน',html:`<div style="text-align:left;line-height:1.9">สมาชิก: <b>${esc(m.fullName)}</b><br>ยอดเดิม: <b>฿${money(m.balance)}</b><br>${isTop?'เติมเงิน':'ชำระเงิน'}: <b>฿${money(amount)}</b><br>ยอดใหม่: <b>฿${money(after)}</b></div>`,icon:'question',showCancelButton:true,confirmButtonText:'ยืนยันรายการ',cancelButtonText:'ยกเลิก'});
  if(!result.isConfirmed)return;
  try{
    Swal.fire({title:'กำลังบันทึก...',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
    const res=await gas(isTop?'topUp':'payment',m.memberId,amount,'เจ้าหน้าที่สหกรณ์','');
    await Swal.fire({icon:'success',title:isTop?'เติมเงินสำเร็จ':'ชำระเงินสำเร็จ',html:receiptHtml(res),showCancelButton:true,confirmButtonText:'🖨️ พิมพ์ใบเสร็จ',cancelButtonText:'รายการใหม่'});
    if(Swal.getCancelButton && false){}
    state.selected[target]=res.member;
    renderTransactionWorkspace(target,res.member);
    refreshDashboard();
  }catch(e){showError(e)}
}

function receiptHtml(res){
  return `<div class="receipt"><div class="receipt-title">✅ ทำรายการสำเร็จ</div><div class="receipt-amount">฿${money(res.amount)}</div><div class="receipt-line"><span>สมาชิก</span><b>${esc(res.member.fullName)}</b></div><div class="receipt-line"><span>รหัสสมาชิก</span><b>${esc(res.member.memberId)}</b></div><div class="receipt-line"><span>ประเภท</span><b>${res.type==='TOPUP'?'เติมเงิน':'ชำระเงิน'}</b></div><div class="receipt-line"><span>ยอดคงเหลือ</span><b>฿${money(res.afterBalance)}</b></div><div class="receipt-line"><span>เวลา</span><b>${dt(res.dateTime)}</b></div></div>`;
}

function openMemberModal(){
  document.getElementById('modal-root').innerHTML=`<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><h3>+ เพิ่มสมาชิก</h3><button class="close-btn" onclick="closeModal()">×</button></div><div class="modal-body"><div class="form-grid"><div class="form-group"><label>รหัสสมาชิก *</label><input id="f-id" class="input" placeholder="65006"></div><div class="form-group"><label>สถานะ</label><select id="f-status" class="input"><option>ใช้งาน</option><option>ระงับ</option></select></div><div class="form-group"><label>ชื่อ *</label><input id="f-first" class="input"></div><div class="form-group"><label>นามสกุล *</label><input id="f-last" class="input"></div><div class="form-group"><label>ระดับชั้น *</label><input id="f-class" class="input" placeholder="ป.6"></div><div class="form-group"><label>ห้อง *</label><input id="f-room" class="input" placeholder="1"></div><div class="form-group full"><label>ยอดเงินเริ่มต้น</label><input id="f-balance" class="input" type="number" min="0" step="0.01" value="0"></div></div></div><div class="modal-foot"><button class="btn secondary" onclick="closeModal()">ยกเลิก</button><button class="btn primary" onclick="saveMember()">บันทึกสมาชิก</button></div></div></div>`;
}
function closeModal(){document.getElementById('modal-root').innerHTML=''}
async function saveMember(){
  const data={memberId:v('f-id'),firstName:v('f-first'),lastName:v('f-last'),className:v('f-class'),room:v('f-room'),initialBalance:Number(v('f-balance')),status:v('f-status')};
  if(!data.memberId||!data.firstName||!data.lastName||!data.className||!data.room){Swal.fire('⚠️ กรุณากรอกข้อมูลให้ครบถ้วน','','warning');return}
  try{const m=await gas('addMember',data);closeModal();await Swal.fire({icon:'success',title:'เพิ่มสมาชิกสำเร็จ',text:`${m.fullName} • ${m.memberId}`,confirmButtonText:'สร้าง/ดูบัตรสมาชิก'});showMemberCard(m);refreshDashboard()}catch(e){showError(e)}
}

function showMemberCard(m){
  document.getElementById('modal-root').innerHTML=`<div class="modal-backdrop"><div class="modal" style="width:min(820px,100%)"><div class="modal-head"><h3>บัตรสมาชิก QR Code</h3><button class="close-btn" onclick="closeModal()">×</button></div><div class="modal-body"><div id="card-print" class="card-preview print-target"><div><div class="card-school">🏫 ระบบสแกนสหกรณ์</div><div class="card-person">${esc(m.fullName)}</div><div class="card-meta">รหัสสมาชิก: <b>${esc(m.memberId)}</b></div><div class="card-meta">ชั้น: <b>${esc(m.classRoom)}</b></div><div class="card-meta" style="margin-top:18px">ใช้ QR Code นี้สำหรับเติมเงินและชำระเงิน</div></div><div class="qr-holder"><div id="member-qr"></div></div></div></div><div class="modal-foot no-print"><button class="btn secondary" onclick="closeModal()">ปิด</button><button class="btn secondary" onclick="printCard()"><i class="fa-solid fa-print"></i> พิมพ์บัตร</button><button class="btn primary" onclick="downloadCardQR(${JSON.stringify(m)})"><i class="fa-solid fa-download"></i> ดาวน์โหลด QR</button></div></div></div>`;
  setTimeout(()=>new QRCode(document.getElementById('member-qr'),{text:m.qrCode||`COOP:${m.memberId}`,width:150,height:150,correctLevel:QRCode.CorrectLevel.M}),50);
}
function printCard(){window.print()}
function downloadCardQR(m){const img=document.querySelector('#member-qr img');if(!img){Swal.fire('กำลังสร้าง QR','','info');return}const a=document.createElement('a');a.href=img.src;a.download=`QR-${m.memberId}.png`;a.click()}

async function startScanner(target){
  stopScanner();
  const boxId=`scanner-${target}`;
  const box=document.getElementById(boxId);
  box.innerHTML='';
  try{
    const scanner=new Html5Qrcode(boxId); state.scanner=scanner;
    await scanner.start({facingMode:{exact:'environment'}},{fps:10,qrbox:(w,h)=>({width:Math.min(250,w-30),height:Math.min(250,h-30)})},
      text=>handleQR(text,target),()=>{});
  }catch(err){
    box.innerHTML=`<div class="scanner-placeholder"><i class="fa-solid fa-camera-slash"></i><p>ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้กล้อง หรือเลือกอัปโหลดรูป QR Code</p></div>`;
    Swal.fire('⚠️ เปิดกล้องไม่ได้','กรุณาอนุญาตการใช้กล้อง หรือเลือกอัปโหลดรูป QR Code','warning');
  }
}

async function scanImage(event,target){
  const file=event.target.files?.[0]; event.target.value='';
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){Swal.fire('⚠️ ไฟล์ไม่รองรับ','กรุณาเลือก JPG, JPEG, PNG หรือ WEBP','warning');return}
  try{
    stopScanner();
    const scanner=new Html5Qrcode(`scanner-${target}`);
    const text=await scanner.scanFile(file,true);
    await scanner.clear();
    handleQR(text,target);
  }catch(e){Swal.fire('⚠️ ไม่พบ QR Code ในรูปภาพ','กรุณาลองใหม่อีกครั้ง','warning')}
}

async function handleQR(text,target){
  stopScanner();
  const raw=String(text||'').trim();
  if(!/^COOP:[A-Za-z0-9_-]+$/i.test(raw)){Swal.fire('⚠️ QR Code ไม่ถูกต้อง','QR นี้ไม่ใช่ QR สมาชิกของระบบสหกรณ์','warning');return}
  const id=raw.split(':')[1];
  try{
    const m=await gas('getMemberById',id);
    if(!m){Swal.fire('⚠️ ไม่พบสมาชิก',`ไม่พบรหัส ${esc(id)}`,'warning');return}
    selectMember(m,target);
  }catch(e){showError(e)}
}

function stopScanner(){
  if(state.scanner){state.scanner.stop().catch(()=>{}).finally(()=>{state.scanner=null})}
}
function v(id){return document.getElementById(id)?.value.trim()||''}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function showError(e){console.error(e);Swal.fire('⚠️ ระบบผิดพลาด',String(e?.message||e||'ไม่สามารถทำรายการได้').replace(/\|/g,'<br>'),'error')}
</script>
