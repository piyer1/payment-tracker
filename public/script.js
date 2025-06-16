// Firebase Configuration is now handled in the HTML file

// Tab switching functionality
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab content
    document.getElementById(tabName + '-tab').classList.add('active');
    
    // Add active class to clicked tab
    event.target.classList.add('active');
    
    // If switching to settlement tab, update the settlement recommendations
    if (tabName === 'settlement' && window.appData) {
        showDebtSettlement();
    }
}

// Add Member
async function addMember() {
    const nameInput = document.getElementById('memberName');
    const name = nameInput.value.trim();
    if (name) {
        try {
            const memberRef = window.firestore.doc(window.db, 'members', name);
            await window.firestore.setDoc(memberRef, { name });
            nameInput.value = '';
        } catch (error) {
            console.error("Error adding member:", error);
        }
    }
}

// Add Purchase
async function addPurchase() {
    const purchaseName = document.getElementById('purchaseName').value.trim();
    const amount = parseFloat(document.getElementById('purchaseAmount').value);
    const purchaser = document.getElementById('purchaser').value;
    const splitMembers = Array.from(document.querySelectorAll('#splitMembers input:checked')).map(input => input.value);

    if (purchaseName && amount > 0 && purchaser && splitMembers.length > 0) {
        try {
            const splitAmount = amount / splitMembers.length;
            const purchase = {
                name: purchaseName,
                amount,
                purchaser,
                split: splitMembers.map(member => ({ member, amount: splitAmount })),
                timestamp: new Date()
            };
            await window.firestore.addDoc(window.firestore.collection(window.db, 'purchases'), purchase);
            document.getElementById('purchaseName').value = '';
            document.getElementById('purchaseAmount').value = '';
        } catch (error) {
            console.error("Error adding purchase:", error);
        }
    }
}

// Record Repayment
async function recordRepayment() {
    const payer = document.getElementById('payer').value;
    const receiver = document.getElementById('receiver').value;
    const amount = parseFloat(document.getElementById('repaymentAmount').value);

    if (payer && receiver && amount > 0 && payer !== receiver) {
        try {
            await window.firestore.addDoc(window.firestore.collection(window.db, 'repayments'), {
                payer,
                receiver,
                amount,
                timestamp: new Date()
            });
            document.getElementById('repaymentAmount').value = '';
        } catch (error) {
            console.error("Error recording repayment:", error);
        }
    }
}

// Debt Settlement Algorithm
function calculateOptimalSettlement(members, purchases, repayments) {
    // Calculate current balances
    const balances = {};
    members.forEach(member => balances[member.name] = 0);

    purchases.forEach(purchase => {
        balances[purchase.purchaser] -= purchase.amount;
        purchase.split.forEach(split => {
            balances[split.member] += split.amount;
        });
    });

    repayments.forEach(repayment => {
        balances[repayment.payer] -= repayment.amount;
        balances[repayment.receiver] += repayment.amount;
    });

    // Separate creditors (owed money) and debtors (owe money)
    const creditors = [];
    const debtors = [];
    
    Object.entries(balances).forEach(([member, balance]) => {
        if (balance > 0.01) { // Small threshold to handle floating point errors
            creditors.push({ name: member, amount: balance });
        } else if (balance < -0.01) {
            debtors.push({ name: member, amount: Math.abs(balance) });
        }
    });

    // Sort by amount (largest first)
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    // Generate settlement transactions using greedy algorithm
    const settlements = [];
    let creditorIndex = 0;
    let debtorIndex = 0;

    while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
        const creditor = creditors[creditorIndex];
        const debtor = debtors[debtorIndex];
        
        const settlementAmount = Math.min(creditor.amount, debtor.amount);
        
        settlements.push({
            from: debtor.name,
            to: creditor.name,
            amount: settlementAmount,
            type: 'settlement'
        });
        
        creditor.amount -= settlementAmount;
        debtor.amount -= settlementAmount;
        
        if (creditor.amount < 0.01) creditorIndex++;
        if (debtor.amount < 0.01) debtorIndex++;
    }

    return {
        settlements,
        totalTransactions: settlements.length,
        balances: Object.entries(balances).map(([name, balance]) => ({ name, balance }))
    };
}

// Show debt settlement recommendations
function showDebtSettlement() {
    const settlementDiv = document.getElementById('settlementRecommendations');
    
    if (!window.appData) {
        settlementDiv.innerHTML = '<p>Loading...</p>';
        return;
    }
    
    const result = calculateOptimalSettlement(window.appData.members, window.appData.purchases, window.appData.repayments);
    
    if (result.settlements.length === 0) {
        settlementDiv.innerHTML = '<div class="transaction-item"><p>🎉 All debts are already settled! Everyone\'s balance is $0.00</p></div>';
        return;
    }
    
    let html = `
        <div class="transaction-item">
            <div class="transaction-description">📊 Settlement Summary</div>
            <div class="transaction-amount">
                ${result.totalTransactions} payment${result.totalTransactions === 1 ? '' : 's'} needed to settle all debts
            </div>
        </div>
    `;
    
    html += '<h3>Current Balances</h3>';
    result.balances.forEach(({ name, balance }) => {
        if (Math.abs(balance) > 0.01) {
            const balanceClass = balance > 0 ? 'amount-negative' : 'amount-positive';
            const status = balance > 0 ? 'is owed' : 'owes';
            const itemClass = balance > 0 ? 'negative' : 'positive';
            
            html += `
                <div class="transaction-item ${itemClass}">
                    <div class="transaction-description">${name}</div>
                    <div class="transaction-amount">
                        <span class="${balanceClass}">${status} $${Math.abs(balance).toFixed(2)}</span>
                    </div>
                </div>
            `;
        }
    });
    
    html += '<h3>Recommended Payments</h3>';
    result.settlements.forEach((settlement, index) => {
        html += `
            <div class="transaction-item negative">
                <div class="transaction-description">Step ${index + 1}: ${settlement.from} pays ${settlement.to}</div>
                <div class="transaction-amount">
                    <span class="amount-negative">-$${settlement.amount.toFixed(2)}</span>
                </div>
                <div class="transaction-balance">This payment settles $${settlement.amount.toFixed(2)} of debt</div>
            </div>
        `;
    });
    
    html += `
        <div class="transaction-item">
            <div class="transaction-description">💡 Why this is optimal</div>
            <div class="transaction-balance">
                This greedy algorithm minimizes the total number of payments needed by always settling 
                the largest possible amounts first. Without this optimization, members might need to make 
                many more individual payments to settle their debts.
            </div>
        </div>
    `;
    
    settlementDiv.innerHTML = html;
}

// Generate Transaction History for a specific member
function generateMemberHistory(memberName, members, purchases, repayments) {
    const transactions = [];
    
    // Process purchases
    purchases.forEach(purchase => {
        const purchaseDate = purchase.timestamp?.toDate?.() || new Date(purchase.timestamp) || new Date();
        
        // If this member made the purchase
        if (purchase.purchaser === memberName) {
            transactions.push({
                date: purchaseDate,
                type: 'purchase_made',
                description: `Paid for ${purchase.name}`,
                amount: -purchase.amount,
                details: `Split among ${purchase.split.length} people`
            });
        }
        
        // If this member owes money from the purchase
        const memberSplit = purchase.split.find(split => split.member === memberName);
        if (memberSplit) {
            transactions.push({
                date: purchaseDate,
                type: 'purchase_owe',
                description: `Your share of ${purchase.name} (paid by ${purchase.purchaser})`,
                amount: memberSplit.amount,
                details: `$${memberSplit.amount.toFixed(2)} of $${purchase.amount.toFixed(2)} total`
            });
        }
    });
    
    // Process repayments
    repayments.forEach(repayment => {
        const repaymentDate = repayment.timestamp?.toDate?.() || new Date(repayment.timestamp) || new Date();
        
        // If this member made a repayment
        if (repayment.payer === memberName) {
            transactions.push({
                date: repaymentDate,
                type: 'repayment_made',
                description: `Paid ${repayment.receiver}`,
                amount: -repayment.amount,
                details: 'Repayment'
            });
        }
        
        // If this member received a repayment
        if (repayment.receiver === memberName) {
            transactions.push({
                date: repaymentDate,
                type: 'repayment_received',
                description: `Received payment from ${repayment.payer}`,
                amount: -repayment.amount,
                details: 'Repayment received'
            });
        }
    });
    
    // Sort by date
    transactions.sort((a, b) => a.date - b.date);
    
    // Calculate running balance
    let runningBalance = 0;
    transactions.forEach(transaction => {
        runningBalance += transaction.amount;
        transaction.runningBalance = runningBalance;
    });
    
    return transactions;
}

// Show member history
function showMemberHistory() {
    const selectedMember = document.getElementById('historyMember').value;
    const historyDiv = document.getElementById('memberHistory');
    
    if (!selectedMember) {
        historyDiv.innerHTML = '';
        return;
    }
    
    if (!window.appData) {
        historyDiv.innerHTML = '<p>Loading...</p>';
        return;
    }
    
    const history = generateMemberHistory(selectedMember, window.appData.members, window.appData.purchases, window.appData.repayments);
    
    if (history.length === 0) {
        historyDiv.innerHTML = '<p>No transactions found for this member.</p>';
        return;
    }
    
    let html = `<h3>${selectedMember}'s Transaction History</h3>`;
    
    history.forEach(transaction => {
        const isPositive = transaction.amount > 0;
        const amountClass = isPositive ? 'amount-positive' : 'amount-negative';
        const itemClass = isPositive ? 'positive' : 'negative';
        const sign = isPositive ? '+' : '';
        
        html += `
            <div class="transaction-item ${itemClass}">
                <div class="transaction-date">${transaction.date.toLocaleDateString()} ${transaction.date.toLocaleTimeString()}</div>
                <div class="transaction-description">${transaction.description}</div>
                <div class="transaction-amount">
                    <span class="${amountClass}">${sign}$${Math.abs(transaction.amount).toFixed(2)}</span>
                    <span style="color: #aaa; margin-left: 10px;">${transaction.details}</span>
                </div>
                <div class="transaction-balance">Running balance: $${transaction.runningBalance.toFixed(2)}</div>
            </div>
        `;
    });
    
    historyDiv.innerHTML = html;
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
    const historySelect = document.getElementById('historyMember');
    
    const options = ['<option value="">Select a member</option>'].concat(
        members.map(member => `<option value="${member.name}">${member.name}</option>`)
    ).join('');
    
    purchaserSelect.innerHTML = options;
    payerSelect.innerHTML = options;
    receiverSelect.innerHTML = options;
    historySelect.innerHTML = options;

    // Update Split Members Checkboxes
    const splitMembersDiv = document.getElementById('splitMembers');
    splitMembersDiv.innerHTML = '<p>Split among:</p>' + members.map(member => `
        <label><input type="checkbox" value="${member.name}"> ${member.name}</label>
    `).join('');

    // Update Ledger
    const ledger = document.getElementById('ledger');
    let html = '<h3>Purchases</h3><table><tr><th>Purchase</th><th style="cursor: pointer" onclick="sortPurchases()">Paid By ↕</th><th>Amount</th><th>Owes</th></tr>';
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

    html += '<h3>Repayments</h3><table><tr><th style="cursor: pointer" onclick="sortRepaymentsByPayer()">Payer ↕</th><th style="cursor: pointer" onclick="sortRepaymentsByReceiver()">Receiver ↕</th><th>Amount</th></tr>';
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
        balances[purchase.purchaser] -= purchase.amount;
        purchase.split.forEach(split => {
            balances[split.member] += split.amount;
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
    
    // Update history if a member is selected
    if (document.getElementById('historyMember').value) {
        showMemberHistory();
    }
    
    // Update settlement recommendations if the settlement tab is active
    const settlementTab = document.getElementById('settlement-tab');
    if (settlementTab && settlementTab.classList.contains('active')) {
        showDebtSettlement();
    }
}

// Real-Time Listeners
async function setupListeners() {
    let members = [];
    let purchases = [];
    let repayments = [];

    try {
        // Listen for members
        const membersCollection = window.firestore.collection(window.db, 'members');
        const unsubscribeMembers = window.firestore.onSnapshot(membersCollection, snapshot => {
            members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.appData = { members, purchases, repayments };
            updateUI(members, purchases, repayments);
        });

        // Listen for purchases
        const purchasesCollection = window.firestore.collection(window.db, 'purchases');
        const unsubscribePurchases = window.firestore.onSnapshot(purchasesCollection, snapshot => {
            purchases = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.appData = { members, purchases, repayments };
            updateUI(members, purchases, repayments);
        });

        // Listen for repayments
        const repaymentsCollection = window.firestore.collection(window.db, 'repayments');
        const unsubscribeRepayments = window.firestore.onSnapshot(repaymentsCollection, snapshot => {
            repayments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            window.appData = { members, purchases, repayments };
            updateUI(members, purchases, repayments);
        });

        // Make data available globally for sorting
        window.appData = {
            members,
            purchases,
            repayments
        };
    } catch (error) {
        console.error("Error setting up listeners:", error);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupListeners();
});

// Add these new sorting functions at the end of the file
let purchasesSortAsc = true;
let repaymentsSortPayerAsc = true;
let repaymentsSortReceiverAsc = true;

function sortPurchases() {
    const purchases = window.appData.purchases;
    purchases.sort((a, b) => {
        if (purchasesSortAsc) {
            return a.purchaser.localeCompare(b.purchaser);
        } else {
            return b.purchaser.localeCompare(a.purchaser);
        }
    });
    purchasesSortAsc = !purchasesSortAsc;
    updateUI(window.appData.members, purchases, window.appData.repayments);
}

function sortRepaymentsByPayer() {
    const repayments = window.appData.repayments;
    repayments.sort((a, b) => {
        if (repaymentsSortPayerAsc) {
            return a.payer.localeCompare(b.payer);
        } else {
            return b.payer.localeCompare(a.payer);
        }
    });
    repaymentsSortPayerAsc = !repaymentsSortPayerAsc;
    updateUI(window.appData.members, window.appData.purchases, repayments);
}

function sortRepaymentsByReceiver() {
    const repayments = window.appData.repayments;
    repayments.sort((a, b) => {
        if (repaymentsSortReceiverAsc) {
            return a.receiver.localeCompare(b.receiver);
        } else {
            return b.receiver.localeCompare(a.receiver);
        }
    });
    repaymentsSortReceiverAsc = !repaymentsSortReceiverAsc;
    updateUI(window.appData.members, window.appData.purchases, repayments);
}