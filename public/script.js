// Firebase Configuration (Replace with your Firebase project config)
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Add Member
async function addMember() {
    const nameInput = document.getElementById('memberName');
    const name = nameInput.value.trim();
    if (name) {
        const memberRef = db.collection('members').doc(name);
        await memberRef.set({ name });
        nameInput.value = '';
    }
}

// Add Purchase
async function addPurchase() {
    const purchaseName = document.getElementById('purchaseName').value.trim();
    const amount = parseFloat(document.getElementById('purchaseAmount').value);
    const purchaser = document.getElementById('purchaser').value;
    const splitMembers = Array.from(document.querySelectorAll('#splitMembers input:checked')).map(input => input.value);

    if (purchaseName && amount > 0 && purchaser && splitMembers.length > 0) {
        const splitAmount = amount / splitMembers.length;
        const purchase = {
            name: purchaseName,
            amount,
            purchaser,
            split: splitMembers.map(member => ({ member, amount: splitAmount })),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('purchases').add(purchase);
        document.getElementById('purchaseName').value = '';
        document.getElementById('purchaseAmount').value = '';
    }
}

// Record Repayment
async function recordRepayment() {
    const payer = document.getElementById('payer').value;
    const receiver = document.getElementById('receiver').value;
    const amount = parseFloat(document.getElementById('repaymentAmount').value);

    if (payer && receiver && amount > 0 && payer !== receiver) {
        await db.collection('repayments').add({
            payer,
            receiver,
            amount,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('repaymentAmount').value = '';
    }
}

// Update UI
function updateUI(members, purchases, repayments) {
    // Update Member List
    const memberList = document.getElementById('memberList');
    memberList.innerHTML = members.map(member => `<li>${member.name}</li>`).join('');

    // Update Purchaser and Repayment Dropdowns
    const purchaserSelect = document.getElementById('purchaser');
    const payerSelect = document.getElementById('payer');
    const receiverSelect = document.getElementById('receiver');
    const options = ['<option value="">Select a member</option>'].concat(
        members.map(member => `<option value="${member.name}">${member.name}</option>`)
    ).join('');
    purchaserSelect.innerHTML = options;
    payerSelect.innerHTML = options;
    receiverSelect.innerHTML = options;

    // Update Split Members Checkboxes
    const splitMembersDiv = document.getElementById('splitMembers');
    splitMembersDiv.innerHTML = '<p>Split among:</p>' + members.map(member => `
        <label><input type="checkbox" value="${member.name}"> ${member.name}</label>
    `).join('');

    // Update Ledger
    const ledger = document.getElementById('ledger');
    let html = '<h3>Purchases</h3><table><tr><th>Purchase</th><th>Paid By</th><th>Amount</th><th>Owes</th></tr>';
    purchases.forEach(purchase => {
        purchase.split.forEach(split => {
            html += `<tr>
                <td>${purchase.name}</td>
                <td>${purchase.purchaser}</td>
                <td>$${purchase.amount.toFixed(2)}</td>
                <td>${split.member} owes $${split.amount.toFixed(2)}</td>
            </tr>`;
        });
    });
    html += '</table>';

    html += '<h3>Repayments</h3><table><tr><th>Payer</th><th>Receiver</th><th>Amount</th></tr>';
    repayments.forEach(repayment => {
        html += `<tr>
            <td>${repayment.payer}</td>
            <td>${repayment.receiver}</td>
            <td>$${repayment.amount.toFixed(2)}</td>
        </tr>`;
    });
    html += '</table>';

    // Calculate Balances
    const balances = {};
    members.forEach(member => balances[member.name] = 0);

    purchases.forEach(purchase => {
        balances[purchase.purchaser] += purchase.amount;
        purchase.split.forEach(split => {
            balances[split.member] -= split.amount;
        });
    });

    repayments.forEach(repayment => {
        balances[repayment.payer] -= repayment.amount;
        balances[repayment.receiver] += repayment.amount;
    });

    html += '<h3>Current Balances</h3><table><tr><th>Member</th><th>Balance</th></tr>';
    Object.keys(balances).forEach(member => {
        html += `<tr><td>${member}</td><td>$${balances[member].toFixed(2)}</td></tr>`;
    });
    html += '</table>';

    ledger.innerHTML = html;
}

// Real-Time Listeners
function setupListeners() {
    let members = [];
    let purchases = [];
    let repayments = [];

    // Listen for members
    db.collection('members').onSnapshot(snapshot => {
        members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateUI(members, purchases, repayments);
    });

    // Listen for purchases
    db.collection('purchases').onSnapshot(snapshot => {
        purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateUI(members, purchases, repayments);
    });

    // Listen for repayments
    db.collection('repayments').onSnapshot(snapshot => {
        repayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateUI(members, purchases, repayments);
    });
}

// Initialize
setupListeners();