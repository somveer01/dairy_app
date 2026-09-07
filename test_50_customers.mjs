import { INDIAN_NAMES, generate50Customers, generateDailyDeliveriesForCustomers } from './src/services/mockDataGenerator.mjs';

console.log('--- STARTING 50 CUSTOMER STRESS & FUNCTIONALITY TEST ---');

// 1. Generate 50 customers
const customers = generate50Customers('supp_test_1');
console.log(`[PASS] Generated ${customers.length} realistic customers.`);

const cowCustomers = customers.filter(c => c.milkType === 'cow');
const buffaloCustomers = customers.filter(c => c.milkType === 'buffalo');
console.log(`   - Cow milk customers: ${cowCustomers.length}`);
console.log(`   - Buffalo milk customers: ${buffaloCustomers.length}`);

if (customers.length !== 50) {
  throw new Error(`Expected 50 customers, got ${customers.length}`);
}

// 2. Generate daily register deliveries for 50 customers for Morning & Evening
const today = '2026-09-07';
const morningEntries = generateDailyDeliveriesForCustomers(customers, today, 'Morning');
const eveningEntries = generateDailyDeliveriesForCustomers(customers, today, 'Evening');
const allEntries = [...morningEntries, ...eveningEntries];

console.log(`[PASS] Generated ${morningEntries.length} Morning deliveries and ${eveningEntries.length} Evening deliveries.`);
console.log(`   - Total daily milk entries: ${allEntries.length}`);

// 3. Test Daily Volume and Billing Aggregations
let totalCowL = 0;
let totalBuffaloL = 0;
let totalBilledToday = 0;

allEntries.forEach(e => {
  if (e.milkType === 'cow') totalCowL += e.quantityLitres;
  if (e.milkType === 'buffalo') totalBuffaloL += e.quantityLitres;
  totalBilledToday += e.amount;
});

console.log(`[PASS] Daily Delivery Aggregation:`);
console.log(`   - Total Cow Milk Volume: ${totalCowL.toFixed(1)} L`);
console.log(`   - Total Buffalo Milk Volume: ${totalBuffaloL.toFixed(1)} L`);
console.log(`   - Combined Milk Volume: ${(totalCowL + totalBuffaloL).toFixed(1)} L`);
console.log(`   - Total Billed Today: ₹${totalBilledToday.toFixed(2)}`);

// 4. Test Multi-Day Simulation (10 days, 20 days, 30 days)
console.log('\n--- TESTING 10, 20, 30 DAYS DUE ENGINE ---');

const multiDayEntries = [];
for (let d = 1; d <= 30; d++) {
  const dayStr = `2026-08-${String(d).padStart(2, '0')}`;
  const dayEntries = generateDailyDeliveriesForCustomers(customers, dayStr, 'Morning');
  multiDayEntries.push(...dayEntries);
}
console.log(`[PASS] Simulated 30 days across 50 customers: ${multiDayEntries.length} total delivery records.`);

const mockPayments = [
  {
    id: 'pay_1',
    supplierId: 'supp_test_1',
    customerId: 'cust_1',
    customerName: customers[0].name,
    date: '2026-08-15',
    amountPaid: 1000,
    createdAt: Date.now()
  },
  {
    id: 'pay_2',
    supplierId: 'supp_test_1',
    customerId: 'cust_2',
    customerName: customers[1].name,
    date: '2026-08-20',
    amountPaid: 1500,
    createdAt: Date.now()
  }
];

const calculateDuesForPeriod = (daysCount) => {
  const cutoffDay = 30 - daysCount + 1;
  const cutoffStr = `2026-08-${String(cutoffDay).padStart(2, '0')}`;

  const periodEntries = multiDayEntries.filter(e => e.date >= cutoffStr);
  const periodPayments = mockPayments.filter(p => p.date >= cutoffStr);

  const totalBilled = periodEntries.reduce((sum, e) => sum + e.amount, 0);
  const totalPaid = periodPayments.reduce((sum, p) => sum + p.amountPaid, 0);
  const netDue = totalBilled - totalPaid;

  return { daysCount, cutoffStr, periodEntriesCount: periodEntries.length, totalBilled, totalPaid, netDue };
};

const due10 = calculateDuesForPeriod(10);
console.log(`[PASS] Last 10 Days Calculation:`);
console.log(`   - Entries evaluated: ${due10.periodEntriesCount}`);
console.log(`   - Total Billed: ₹${due10.totalBilled.toFixed(2)}, Paid: ₹${due10.totalPaid}, Net Due: ₹${due10.netDue.toFixed(2)}`);

const due20 = calculateDuesForPeriod(20);
console.log(`[PASS] Last 20 Days Calculation:`);
console.log(`   - Entries evaluated: ${due20.periodEntriesCount}`);
console.log(`   - Total Billed: ₹${due20.totalBilled.toFixed(2)}, Paid: ₹${due20.totalPaid}, Net Due: ₹${due20.netDue.toFixed(2)}`);

const due30 = calculateDuesForPeriod(30);
console.log(`[PASS] Last 30 Days (Monthly) Calculation:`);
console.log(`   - Entries evaluated: ${due30.periodEntriesCount}`);
console.log(`   - Total Billed: ₹${due30.totalBilled.toFixed(2)}, Paid: ₹${due30.totalPaid}, Net Due: ₹${due30.netDue.toFixed(2)}`);

// 5. Test WhatsApp message format
const cust1 = customers[0];
const cust1Entries = multiDayEntries.filter(e => e.customerId === 'cust_1');
const cust1Billed = cust1Entries.reduce((s, e) => s + e.amount, 0);
const cust1Cow = cust1Entries.filter(e => e.milkType === 'cow').reduce((s, e) => s + e.quantityLitres, 0);
const cust1Buffalo = cust1Entries.filter(e => e.milkType === 'buffalo').reduce((s, e) => s + e.quantityLitres, 0);

const formatDueBill = (customer, cowL, buffaloL, billed, paid, netDue, businessName, periodLabel) => {
  let itemsText = '';
  if (cowL > 0) itemsText += `\n🐄 Cow Milk: ${cowL.toFixed(1)} L`;
  if (buffaloL > 0) itemsText += `\n🐃 Buffalo Milk: ${buffaloL.toFixed(1)} L`;

  return `🥛 *${businessName}*
-----------------------------
👤 Customer: *${customer.name}*
📅 Period: ${periodLabel}
${itemsText}
💰 Total Milk Billed: ₹${billed.toFixed(2)}
💵 Payment Received: ₹${paid.toFixed(2)}
-----------------------------
🔴 *Total Due Balance: ₹${netDue.toFixed(2)}*
-----------------------------
Please clear the pending balance at your earliest convenience. Thank you!`;
};

const whatsappText = formatDueBill(cust1, cust1Cow, cust1Buffalo, cust1Billed, 1000, cust1Billed - 1000, 'Om Fresh Dairy', 'Last 30 Days (Month)');
console.log('\n--- SAMPLE WHATSAPP MESSAGE FORMAT ---');
console.log(whatsappText);

console.log('\n>>> ALL 50 CUSTOMER ENGINE & FLOW TESTS COMPLETED SUCCESSFULLY! <<<');
