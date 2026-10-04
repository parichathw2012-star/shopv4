const CONFIG = {
  SPREADSHEET_ID: '1q0P3EKmqV3CLTsb4QsYajYjWPdBYeB1KpzqFQEy6JpU',
  SHEETS: {
    MEMBERS: 'Members',
    TOPUP: 'TopUp',
    PAYMENTS: 'Payments'
  },
  TIMEZONE: Session.getScriptTimeZone() || 'Asia/Bangkok'
};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('ระบบสหกรณ์นักเรียน v5')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getSS_() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID === '1q0P3EKmqV3CLTsb4QsYajYjWPdBYeB1KpzqFQEy6JpU') {
    throw new Error('กรุณาตั้งค่า SPREADSHEET_ID ใน Code.gs ก่อนใช้งาน');
  }
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet_(name) {
  const sh = getSS_().getSheetByName(name);
  if (!sh) throw new Error(`ไม่พบ Sheet: ${name}`);
  return sh;
}

function setupSheets() {
  const ss = getSS_();
  const specs = {
    Members: ['MemberID','StudentID','FullName','Class','Balance','QRCode','Status','CreatedAt','UpdatedAt'],
    TopUp: ['TransactionID','DateTime','MemberID','StudentID','FullName','Amount','BalanceBefore','BalanceAfter','Operator'],
    Payments: ['PaymentID','DateTime','MemberID','StudentID','FullName','Amount','BalanceBefore','BalanceAfter','Product','Operator']
  };
  Object.keys(specs).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.appendRow(specs[name]);
    else {
      const headers = sh.getRange(1,1,1,specs[name].length).getValues()[0];
      const mismatch = specs[name].some((v,i) => headers[i] !== v);
      if (mismatch) sh.getRange(1,1,1,specs[name].length).setValues([specs[name]]);
    }
    sh.setFrozenRows(1);
  });
  return {ok:true, message:'สร้าง/ตรวจสอบโครงสร้าง Sheets เรียบร้อย'};
}

function now_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function dateKey_(d) {
  return Utilities.formatDate(new Date(d), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function normalize_(v) {
  return String(v == null ? '' : v).trim();
}

function money_(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function rowsToObjects_(values) {
  if (!values || values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map((row, idx) => {
    const o = {_row: idx + 2};
    headers.forEach((h,i) => o[h] = row[i]);
    return o;
  });
}

function getMembers() {
  const sh = getSheet_(CONFIG.SHEETS.MEMBERS);
  return rowsToObjects_(sh.getDataRange().getValues()).map(cleanMember_);
}

function cleanMember_(m) {
  return {
    MemberID: normalize_(m.MemberID),
    StudentID: normalize_(m.StudentID),
    FullName: normalize_(m.FullName),
    Class: normalize_(m.Class),
    Balance: money_(m.Balance),
    QRCode: normalize_(m.QRCode),
    Status: normalize_(m.Status) || 'Active',
    CreatedAt: m.CreatedAt ? String(m.CreatedAt) : '',
    UpdatedAt: m.UpdatedAt ? String(m.UpdatedAt) : ''
  };
}

function getMemberByQRCode(qrCode) {
  const raw = normalize_(qrCode);
  let value = raw;
  const match = raw.match(/^(MEMBER|STUDENT)\s*:\s*(.+)$/i);
  if (match) value = normalize_(match[2]);

  const members = getMembers();
  const found = members.find(m =>
    m.MemberID.toLowerCase() === value.toLowerCase() ||
    m.StudentID.toLowerCase() === value.toLowerCase() ||
    m.QRCode.toLowerCase() === raw.toLowerCase()
  );
  if (!found) throw new Error('ไม่พบข้อมูลสมาชิกจาก QR Code');
  return found;
}

function getMemberByStudentID(studentID) {
  const id = normalize_(studentID).toLowerCase();
  const found = getMembers().find(m => m.StudentID.toLowerCase() === id);
  return found || null;
}

function generateMemberId() {
  const members = getMembers();
  let max = 0;
  members.forEach(m => {
    const n = parseInt(String(m.MemberID).replace(/^M/i,''), 10);
    if (Number.isFinite(n)) max = Math.max(max, n);
  });
  return 'M' + String(max + 1).padStart(3,'0');
}

function nextId_(sheetName, prefix, colIndex) {
  const sh = getSheet_(sheetName);
  const last = sh.getLastRow();
  if (last < 2) return prefix + '000001';
  const vals = sh.getRange(2,colIndex,last-1,1).getValues().flat();
  let max = 0;
  vals.forEach(v => {
    const n = parseInt(String(v).replace(new RegExp('^' + prefix, 'i'),''),10);
    if (Number.isFinite(n)) max = Math.max(max,n);
  });
  return prefix + String(max + 1).padStart(6,'0');
}

function addMember(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const studentID = normalize_(data && data.studentID);
    const fullName = normalize_(data && data.fullName);
    const className = normalize_(data && data.className);
    if (!studentID || !fullName || !className) throw new Error('กรุณากรอกข้อมูลสมาชิกให้ครบ');
    if (getMembers().some(m => m.StudentID.toLowerCase() === studentID.toLowerCase())) {
      throw new Error('รหัสนักเรียนนี้มีอยู่แล้ว');
    }

    const memberID = generateMemberId();
    const created = now_();
    const sh = getSheet_(CONFIG.SHEETS.MEMBERS);
    sh.appendRow([memberID, studentID, fullName, className, 0, `MEMBER:${memberID}`, 'Active', created, created]);

    return getMemberByQRCode(`MEMBER:${memberID}`);
  } finally {
    lock.releaseLock();
  }
}

function updateMemberBalance(memberId, balance) {
  const sh = getSheet_(CONFIG.SHEETS.MEMBERS);
  const values = sh.getDataRange().getValues();
  const id = normalize_(memberId);
  for (let r=1; r<values.length; r++) {
    if (normalize_(values[r][0]) === id) {
      sh.getRange(r+1,5).setValue(money_(balance));
      sh.getRange(r+1,9).setValue(now_());
      return true;
    }
  }
  throw new Error('ไม่พบสมาชิก');
}

function topUpMember(memberId, amount, operator) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const amt = money_(amount);
    if (amt <= 0) throw new Error('จำนวนเงินต้องมากกว่า 0');

    const member = getMembers().find(m => m.MemberID === normalize_(memberId));
    if (!member) throw new Error('ไม่พบสมาชิก');

    const before = money_(member.Balance);
    const after = money_(before + amt);
    updateMemberBalance(member.MemberID, after);

    const txid = nextId_(CONFIG.SHEETS.TOPUP, 'TU', 1);
    getSheet_(CONFIG.SHEETS.TOPUP).appendRow([
      txid, now_(), member.MemberID, member.StudentID, member.FullName,
      amt, before, after, normalize_(operator) || 'เจ้าหน้าที่'
    ]);

    return {
      transactionId: txid,
      member: Object.assign({}, member, {Balance: after, UpdatedAt: now_()}),
      amount: amt, before, after, dateTime: now_()
    };
  } finally {
    lock.releaseLock();
  }
}

function createPayment(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const memberId = normalize_(data && data.memberId);
    const amount = money_(data && data.amount);
    const product = normalize_(data && data.product);
    const operator = normalize_(data && data.operator) || 'เจ้าหน้าที่';

    if (!memberId) throw new Error('กรุณาเลือกสมาชิก');
    if (amount <= 0) throw new Error('ยอดชำระต้องมากกว่า 0');
    if (!product) throw new Error('กรุณาระบุรายการสินค้า');

    const member = getMembers().find(m => m.MemberID === memberId);
    if (!member) throw new Error('ไม่พบสมาชิก');

    const before = money_(member.Balance);
    if (before < amount) {
      throw new Error(`ยอดเงินไม่เพียงพอ (คงเหลือ ฿${before.toFixed(2)} แต่ต้องชำระ ฿${amount.toFixed(2)})`);
    }

    const after = money_(before - amount);
    updateMemberBalance(member.MemberID, after);

    const paymentId = nextId_(CONFIG.SHEETS.PAYMENTS, 'PY', 1);
    getSheet_(CONFIG.SHEETS.PAYMENTS).appendRow([
      paymentId, now_(), member.MemberID, member.StudentID, member.FullName,
      amount, before, after, product, operator
    ]);

    return {
      paymentId,
      dateTime: now_(),
      member: Object.assign({}, member, {Balance: after, UpdatedAt: now_()}),
      amount, before, after, product
    };
  } finally {
    lock.releaseLock();
  }
}

function getPaymentHistory(memberId) {
  const sh = getSheet_(CONFIG.SHEETS.PAYMENTS);
  return rowsToObjects_(sh.getDataRange().getValues())
    .filter(x => normalize_(x.MemberID) === normalize_(memberId))
    .sort((a,b) => new Date(b.DateTime) - new Date(a.DateTime))
    .slice(0,100);
}

function getTopUpHistory(memberId) {
  const sh = getSheet_(CONFIG.SHEETS.TOPUP);
  return rowsToObjects_(sh.getDataRange().getValues())
    .filter(x => normalize_(x.MemberID) === normalize_(memberId))
    .sort((a,b) => new Date(b.DateTime) - new Date(a.DateTime))
    .slice(0,100);
}

function getDashboardData() {
  const members = getMembers();
  const payments = rowsToObjects_(getSheet_(CONFIG.SHEETS.PAYMENTS).getDataRange().getValues());
  const topups = rowsToObjects_(getSheet_(CONFIG.SHEETS.TOPUP).getDataRange().getValues());
  const today = dateKey_(new Date());

  const todayPayments = payments.filter(p => p.DateTime && dateKey_(p.DateTime) === today);
  const recentPayments = payments
    .sort((a,b) => new Date(b.DateTime) - new Date(a.DateTime))
    .slice(0,10)
    .map(p => ({
      PaymentID: normalize_(p.PaymentID),
      DateTime: p.DateTime ? String(p.DateTime) : '',
      StudentID: normalize_(p.StudentID),
      FullName: normalize_(p.FullName),
      Product: normalize_(p.Product),
      Amount: money_(p.Amount)
    }));

  const recentTopups = topups
    .sort((a,b) => new Date(b.DateTime) - new Date(a.DateTime))
    .slice(0,10)
    .map(t => ({
      TransactionID: normalize_(t.TransactionID),
      DateTime: t.DateTime ? String(t.DateTime) : '',
      StudentID: normalize_(t.StudentID),
      FullName: normalize_(t.FullName),
      Amount: money_(t.Amount),
      BalanceAfter: money_(t.BalanceAfter)
    }));

  return {
    memberCount: members.length,
    totalBalance: members.reduce((s,m) => s + money_(m.Balance), 0),
    todayPaymentCount: todayPayments.length,
    recentPayments,
    recentTopups,
    today: today
  };
}

function getAllTransactions(memberId) {
  return {
    payments: getPaymentHistory(memberId),
    topups: getTopUpHistory(memberId)
  };
}
