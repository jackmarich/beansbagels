// Kitchen Management JavaScript

// Mock password for demo purposes - in production, this would be handled securely
const DEMO_PASSWORD = 'bagel';

// Login handling
function handleLogin(event) {
    event.preventDefault();
    const password = document.getElementById('password').value;

    if (password === DEMO_PASSWORD) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('kitchen-dashboard').style.display = 'block';
        loadOrders(); // Load initial orders
        startOrderSimulation(); // Start receiving mock orders
    } else {
        alert('Incorrect password');
    }
}

// Logout handling
function handleLogout() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('kitchen-dashboard').style.display = 'none';
    document.getElementById('password').value = '';
}

// Mock orders data
let mockOrders = [
    {
        id: 'order-001',
        customerName: 'Alex Smith',
        items: ['Everything Bagel w/ Cream Cheese', 'Coffee'],
        time: '10:30 AM',
        status: 'not-started'
    },
    {
        id: 'order-002',
        customerName: 'Sarah Johnson',
        items: ['Plain Bagel w/ Butter', 'Orange Juice'],
        time: '10:35 AM',
        status: 'not-started'
    }
];

// Load orders into columns
function loadOrders() {
    // Clear existing orders
    document.querySelectorAll('.column-content').forEach(column => {
        column.innerHTML = '';
    });

    // Load orders into appropriate columns
    mockOrders.forEach(order => {
        const orderCard = createOrderCard(order);
        document.querySelector(`#${order.status} .column-content`).appendChild(orderCard);
    });

    updateOrderCounts();
}

// Create order card element
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.id = order.id;
    card.draggable = true;

    // Add delete button if in completed column
    const deleteButton = order.status === 'completed' ?
        `<button class="delete-btn" onclick="deleteOrder('${order.id}')">
            <i class="fas fa-trash"></i>
        </button>` : '';

    card.innerHTML = `
        <div class="order-card-header">
            <h3>Order #${order.id.split('-')[1]}</h3>
            ${deleteButton}
        </div>
        <div class="order-details">
            <p><strong>Customer:</strong> ${order.customerName}</p>
            <p><strong>Items:</strong></p>
            <ul>
                ${order.items.map(item => `<li>${item}</li>`).join('')}
            </ul>
        </div>
        <div class="order-time">${order.time}</div>
    `;

    // Add drag event listeners
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);

    return card;
}

// Update order counts
function updateOrderCounts() {
    document.getElementById('pending-count').textContent =
        document.querySelector('#not-started .column-content').children.length;
    document.getElementById('progress-count').textContent =
        document.querySelector('#in-progress .column-content').children.length;
    document.getElementById('completed-count').textContent =
        document.querySelector('#completed .column-content').children.length;
}

// Drag and Drop Functionality
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.id);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function allowDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function drop(e) {
    e.preventDefault();
    const column = e.currentTarget;
    column.classList.remove('drag-over');

    const orderId = e.dataTransfer.getData('text/plain');
    const orderCard = document.getElementById(orderId);
    const newStatus = column.id;

    // Update order status in mock data
    const order = mockOrders.find(o => o.id === orderId);
    if (order) {
        order.status = newStatus;
        // Refresh the card to add/remove delete button
        const newCard = createOrderCard(order);
        // Move the card to the new column
        column.querySelector('.column-content').appendChild(newCard);
        // Remove the old card
        orderCard.remove();
    }

    updateOrderCounts();
}

// Simulate new orders coming in
function startOrderSimulation() {
    setInterval(() => {
        if (Math.random() < 0.3) { // 30% chance of new order every interval
            const newOrder = generateMockOrder();
            mockOrders.push(newOrder);
            const orderCard = createOrderCard(newOrder);
            document.querySelector('#not-started .column-content').appendChild(orderCard);
            updateOrderCounts();

            // Show notification
            showNotification('New Order Received!');
        }
    }, 30000); // Check every 30 seconds
}

// Generate mock order
function generateMockOrder() {
    const orderNum = String(mockOrders.length + 1).padStart(3, '0');
    const mockItems = [
        'Everything Bagel w/ Cream Cheese',
        'Plain Bagel w/ Butter',
        'Sesame Bagel w/ Lox',
        'Cinnamon Raisin Bagel w/ Cream Cheese',
        'Coffee',
        'Orange Juice',
        'Tea'
    ];

    return {
        id: `order-${orderNum}`,
        customerName: generateMockName(),
        items: [mockItems[Math.floor(Math.random() * mockItems.length)]],
        time: new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }),
        status: 'not-started'
    };
}

// Generate mock customer name
function generateMockName() {
    const firstNames = ['John', 'Sarah', 'Michael', 'Emma', 'David', 'Lisa', 'James', 'Emily'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
}

// Show notification
function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Delete order function
function deleteOrder(orderId) {
    if (confirm('Are you sure you want to delete this order?')) {
        // Remove from mockOrders array
        mockOrders = mockOrders.filter(order => order.id !== orderId);

        // Remove from DOM
        const orderCard = document.getElementById(orderId);
        orderCard.classList.add('deleting');

        // Animate removal
        setTimeout(() => {
            orderCard.remove();
            updateOrderCounts();
        }, 300);
    }
}

// Add notification styles
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--white);
        color: var(--maroon);
        padding: 1rem 2rem;
        border-radius: 8px;
        border: 2px solid var(--maroon);
        animation: slideIn 0.3s ease-out;
        z-index: 1000;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        font-weight: 600;
    }

    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style); 