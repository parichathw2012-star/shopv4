/**
 * ระบบสแกนสหกรณ์ (School Cooperative Wallet)
 * Google Apps Script Backend + Google Sheets
 *
 * วิธีใช้:
 * 1) สร้าง Google Sheet 1 ไฟล์
 * 2) Extensions > Apps Script
 * 3) วางไฟล์ Code.gs และสร้างไฟล์ HTML ตามที่ให้มา
 * 4) ตั้งค่า SPREADSHEET_ID ด้านล่าง
 * 5) รัน setupSheets() 1 ครั้งเพื่อสร้างหัวตาราง + ข้อมูลตัวอย่าง
 * 6) Deploy > New deployment > Web app
 *    Execute as: Me
 *    Who has access: ตามนโยบายโรงเรียน
 */

const SPREADSHEET_ID = '1oin8NgWR0IuPezfCFEbEZVLARNza_frgElQF-sTv65I'; // ใส่ Spreadsheet ID หาก Script ไม่ได้ผูกกับ Google Sheet
const APP_NAME = 'ระบบสแกนสหกรณ์';

const SHEET_MEMBERS = 'Members';
const SHEET_TRANSACTIONS = 'Transactions';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSS_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('ไม่พบ Google Spreadsheet กรุณาตั้งค่า SPREADSHEET_ID ใน Code.gs');
  return ss;
}

function setupSheets() {
  const ss = getSS_();

  let members = ss.getSheetByName(SHEET_MEMBERS);
  if (!members) members = ss.insertSheet(SHEET_MEMBERS);
  members.clear();
  members.getRange(1,1,1,10).setValues([[
    'MemberID','FirstName','LastName','FullName','Class','Room','Balance','Status','QRCode','CreatedAt'
  ]]);

  const samples = [
    ['65001','นภา','แสงทอง','นภา แสงทอง','ป.6','1',350,'ใช้งาน','COOP:65001',new Date()],
    ['65002','กิตติพงษ์','ใจดี','กิตติพงษ์ ใจดี','ป.6','1',250,'ใช้งาน','COOP:65002',new Date()],
    ['65003','มาลี','ดวงแก้ว','มาลี ดวงแก้ว','ป.5','2',500,'ใช้งาน','COOP:65003',new Date()],
    ['65004','ธนกร','รุ่งเรือง','ธนกร รุ่งเรือง','ป.5','1',180,'ใช้งาน','COOP:65004',new Date()],
    ['65005','พิมพ์ชนก','สุขใจ','พิมพ์ชนก สุขใจ','ป.4','2',420,'ใช้งาน','COOP:65005',new Date()]
  ];
  members.getRange(2,1,samples.length,10).setValues(samples);
  members.setFrozenRows(1);
  members.autoResizeColumns(1,10);

  let tx = ss.getSheetByName(SHEET_TRANSACTIONS);
  if (!tx) tx = ss.insertSheet(SHEET_TRANSACTIONS);
  tx.clear();
  tx.getRange(1,1,1,10).setValues([[
    'TransactionID','DateTime','MemberID','MemberName','Type','Amount','BeforeBalance','AfterBalance','Staff','Note'
  ]]);
  tx.setFrozenRows(1);
  tx.autoResizeColumns(1,10);

  return {ok:true, message:'สร้างโครงสร้างชีตและข้อมูลตัวอย่างเรียบร้อย'};
}

function getSheet_(name) {
  const sheet = getSS_().getSheetByName(name);
  if (!sheet) throw new Error(`ไม่พบชีต ${name} กรุณารัน setupSheets()`);
  return sheet;
}

function normalize_(v) {
  return String(v == null ? '' : v).trim();
}

function rowToMember_(row) {
  return {
    memberId: normalize_(row[0]),
    firstName: normalize_(row[1]),
    lastName: normalize_(row[2]),
    fullName: normalize_(row[3]),
    className: normalize_(row[4]),
    room: normalize_(row[5]),
    classRoom: `${normalize_(row[4])}/${normalize_(row[5])}`.replace(/\/$/, ''),
    balance: Number(row[6]) || 0,
    status: normalize_(row[7]) || 'ใช้งาน',
    qrCode: normalize_(row[8]) || `COOP:${normalize_(row[0])}`,
    createdAt: row[9] instanceof Date ? row[9].toISOString() : normalize_(row[9])
  };
}

function getMembers() {
  const sheet = getSheet_(SHEET_MEMBERS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2,1,last-1,10).getValues().map(rowToMember_);
}

function getMemberById(memberId) {
  const id = normalize_(memberId).replace(/^COOP:/i,'');
  if (!id) return null;
  const sheet = getSheet_(SHEET_MEMBERS);
  const values = sheet.getDataRange().getValues();
  for (let i=1; i<values.length; i++) {
    if (normalize_(values[i][0]) === id) return rowToMember_(values[i]);
  }
  return null;
}

function searchMember(keyword) {
  const q = normalize_(keyword).toLowerCase();
  if (!q) return [];
  return getMembers().filter(m =>
    [m.memberId,m.firstName,m.lastName,m.fullName,m.className,m.room,m.classRoom]
      .join(' ').toLowerCase().includes(q)
  );
}

function addMember(data) {
  if (!data) throw new Error('ไม่พบข้อมูลสมาชิก');
  const memberId = normalize_(data.memberId);
  const firstName = normalize_(data.firstName);
  const lastName = normalize_(data.lastName);
  const className = normalize_(data.className);
  const room = normalize_(data.room);
  const status = normalize_(data.status) || 'ใช้งาน';
  const initialBalance = Number(data.initialBalance);

  if (!memberId || !firstName || !lastName || !className || !room) {
    throw new Error('กรุณากรอกข้อมูลสมาชิกให้ครบถ้วน');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(memberId)) throw new Error('รหัสสมาชิกควรใช้ตัวอักษร ตัวเลข _ หรือ -');
  if (!Number.isFinite(initialBalance) || initialBalance < 0) throw new Error('ยอดเงินเริ่มต้นไม่ถูกต้อง');
  if (getMemberById(memberId)) throw new Error('รหัสสมาชิกนี้มีอยู่แล้ว');

  const sheet = getSheet_(SHEET_MEMBERS);
  const fullName = `${firstName} ${lastName}`;
  sheet.appendRow([memberId,firstName,lastName,fullName,className,room,initialBalance,status,`COOP:${memberId}`,new Date()]);
  return getMemberById(memberId);
}

function updateMember_(sheet, rowIndex, balance) {
  sheet.getRange(rowIndex,7).setValue(balance);
}

function makeTransactionId_() {
  return 'TX' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Bangkok', 'yyyyMMddHHmmss') +
    '-' + Utilities.getUuid().slice(0,8).toUpperCase();
}

function changeBalance_(memberId, type, amount, staff, note) {
  const id = normalize_(memberId).replace(/^COOP:/i,'');
  const value = Number(amount);

  if (!id) throw new Error('ไม่พบรหัสสมาชิก');
  if (!Number.isFinite(value) || value <= 0) throw new Error('จำนวนเงินต้องมากกว่า 0');
  if (!['TOPUP','PAYMENT'].includes(type)) throw new Error('ประเภทธุรกรรมไม่ถูกต้อง');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const ss = getSS_();
    const members = getSheet_(SHEET_MEMBERS);
    const tx = getSheet_(SHEET_TRANSACTIONS);
    const values = members.getDataRange().getValues();

    let rowIndex = -1;
    let member = null;
    for (let i=1; i<values.length; i++) {
      if (normalize_(values[i][0]) === id) {
        rowIndex = i + 1;
        member = rowToMember_(values[i]);
        break;
      }
    }
    if (rowIndex === -1) throw new Error('ไม่พบสมาชิก');
    if (member.status !== 'ใช้งาน') throw new Error('สมาชิกไม่ได้อยู่ในสถานะใช้งาน');

    const before = Number(members.getRange(rowIndex,7).getValue()) || 0;
    let after = type === 'TOPUP' ? before + value : before - value;
    if (type === 'PAYMENT' && before < value) {
      throw new Error(`ยอดเงินไม่เพียงพอ|ยอดคงเหลือ ${before.toFixed(2)} บาท|ยอดที่ต้องชำระ ${value.toFixed(2)} บาท`);
    }
    if (after < 0) throw new Error('ไม่อนุญาตให้ยอดเงินติดลบ');

    updateMember_(members, rowIndex, after);
    SpreadsheetApp.flush();

    const txId = makeTransactionId_();
    const now = new Date();
    tx.appendRow([
      txId, now, id, member.fullName, type, value, before, after,
      normalize_(staff) || 'เจ้าหน้าที่สหกรณ์', normalize_(note)
    ]);
    SpreadsheetApp.flush();

    return {
      ok:true,
      transactionId:txId,
      dateTime:now.toISOString(),
      member:getMemberById(id),
      type, amount:value, beforeBalance:before, afterBalance:after
    };
  } finally {
    lock.releaseLock();
  }
}

function topUp(memberId, amount, staff, note) {
  return changeBalance_(memberId,'TOPUP',amount,staff,note);
}

function payment(memberId, amount, staff, note) {
  return changeBalance_(memberId,'PAYMENT',amount,staff,note);
}

function getTransactions(limit) {
  const sheet = getSheet_(SHEET_TRANSACTIONS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const n = Math.min(Number(limit) || 10, last - 1);
  const values = sheet.getRange(Math.max(2,last-n+1),1,n,10).getValues();
  return values.reverse().map(r => ({
    transactionId:normalize_(r[0]),
    dateTime:r[1] instanceof Date ? r[1].toISOString() : normalize_(r[1]),
    memberId:normalize_(r[2]),
    memberName:normalize_(r[3]),
    type:normalize_(r[4]),
    amount:Number(r[5]) || 0,
    beforeBalance:Number(r[6]) || 0,
    afterBalance:Number(r[7]) || 0,
    staff:normalize_(r[8]),
    note:normalize_(r[9])
  }));
}

function getDashboard() {
  const members = getMembers();
  const tx = getTransactions(1000);
  const tz = Session.getScriptTimeZone() || 'Asia/Bangkok';
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  const todayTx = tx.filter(t => {
    try { return Utilities.formatDate(new Date(t.dateTime), tz, 'yyyy-MM-dd') === today; }
    catch(e) { return false; }
  });
  const payments = todayTx.filter(t => t.type === 'PAYMENT');
  const sales = payments.reduce((s,t) => s + t.amount, 0);

  return {
    memberCount: members.length,
    totalBalance: members.reduce((s,m) => s + m.balance, 0),
    paymentCountToday: payments.length,
    salesToday: sales,
    recentTransactions: tx.slice(0,10)
  };
}
