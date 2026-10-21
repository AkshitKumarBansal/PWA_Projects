const CACHE_NAME = 'todo-app-cache';
const TODO_KEY = '/local-todos.json';

const form = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');

const message = document.getElementById('message');

const taskList = document.getElementById('taskList');

let tasks = [];


// Function to save tasks to both localStorage and cache
async function saveToBothStorage() {
  localStorage.setItem('tasks', JSON.stringify(tasks));

  try {
    const cache = await caches.open(CACHE_NAME);
    const response = new Response(JSON.stringify(tasks), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(TODO_KEY, response);
  } catch (error) {
    console.error('Error saving to cache:', error);
  }
}


// Function to load tasks from cache or localStorage
async function loadTasks() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(TODO_KEY);
    if(response) {
      tasks = await response.json();
    } else {
      tasks = JSON.parse(localStorage.getItem('tasks')) || [];
    }
  } catch (error) {
    console.error('Error loading tasks:', error);
  }

  // Initial render of tasks on page load
  renderTasks();
}


// Function to render tasks from localStorage
async function renderTasks() {
  taskList.innerHTML = '';
  tasks.forEach(task => {
    const listItem = createListItem(task);
    taskList.appendChild(listItem);
  })
}

// Load tasks from cache or localStorage on page load
loadTasks();


// Event listener for form submission
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const task = taskInput.value.trim();
  if(!task) {
    message.textContent = 'Please enter a task.';
    return;
  }
  const taskItem = createObject(task);
  message.textContent = 'Task added successfully!';
  taskInput.value = '';
  tasks.push(taskItem);
  
  await saveToBothStorage();

  renderTasks();
});



taskList.addEventListener('click', async (e) => {

  // Event delegation for delete buttons
  if(e.target.classList.contains('deleteBtn')) {
    const listItem = e.target.closest('li');

    const taskId = listItem.getAttribute('data-id');
    
    tasks = tasks.filter(task => task.id !== taskId);
    
    await saveToBothStorage();

    const itemText = listItem.querySelector('span').textContent;
    message.textContent = `${itemText} deleted!`;

    renderTasks();
  };

  // Event delegation for complete buttons
  if(e.target.classList.contains('completeBtn')) {
    const listItem = e.target.closest('li');

    const taskId = listItem.getAttribute('data-id');
    
    const task = tasks.find(task => task.id === taskId);
    if(!task) return;

    task.status = 'completed';
    
    await saveToBothStorage();

    const itemText = listItem.querySelector('span').textContent;
    message.textContent = `${itemText} completed!`;

    renderTasks();
  };

});


// Function to create a list item with buttons
function createListItem(task) {
  const completeBtn = document.createElement('button');
  completeBtn.textContent = '✓';
  completeBtn.classList.add('completeBtn');
  completeBtn.setAttribute('aria-label', 'Complete task');

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '🗑';
  deleteBtn.classList.add('deleteBtn');
  deleteBtn.setAttribute('aria-label', 'Delete task');

  const taskText = document.createElement('span');
  taskText.textContent = task.text;

  const list = document.createElement('li');
  list.setAttribute('data-id', task.id);
  list.append(taskText, completeBtn, deleteBtn);
  if(task.status === 'completed') {
    completeBtn.remove();
    list.classList.add('completed');
  }
  return list;
}


// Function to create a task object
function createObject(task) {
  const taskObject = {
    id: crypto.randomUUID(),
    text: task,
    status: 'pending'
  }
  return taskObject;
}