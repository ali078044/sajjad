// =======================================================================
//                          Global Settings
// =======================================================================
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyxhsRSmxiWzwKoqs4roWMRxa_86246Kj3O1w8jGb2q3-eVpCrbAPbOrdW7RTbdqOeq/exec';
let currentUser = null;
let currentSummaryDate = null;
let currentAdminFilter = 'قيد المراجعة (تم التعديل)'; // Default filter for admin view

// =======================================================================
//                          Event Listeners
// =======================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Modal buttons
    document.getElementById('login-icon-btn').addEventListener('click', () => openModal('loginModal'));
    document.getElementById('closeLoginModal').addEventListener('click', () => closeModal('loginModal'));
    document.getElementById('closeEditUserModal').addEventListener('click', () => closeModal('editUserModal'));
    
    // Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('editUserForm').addEventListener('submit', handleUpdateUser);
    
    // Employee Dashboard Buttons
    document.getElementById('showAddScheduleBtn').addEventListener('click', showAddScheduleView);
    document.getElementById('showPreviousSchedulesBtn').addEventListener('click', showPreviousSchedulesView);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Admin Dashboard Buttons
    document.getElementById('showUserManagementBtn').addEventListener('click', showUserManagementView);
    document.getElementById('showScheduleReviewBtn').addEventListener('click', showScheduleReviewView);
    document.getElementById('showWeeklySummaryBtn').addEventListener('click', showWeeklySummaryView);
    document.getElementById('adminLogoutBtn').addEventListener('click', logout);

    // Public filter
    document.getElementById('departmentFilter').addEventListener('change', loadPublicSchedules);

    // Initial data load
    loadInitialData();
});

// =======================================================================
//                      API Communication Helper (NEW & ROBUST)
// =======================================================================
/**
 * Sends a request to the Google Apps Script backend with intelligent retry logic.
 * @param {string} action The function to call in the backend.
 * @param {object} payload The data to send with the request.
 * @param {number} retries The number of times to retry on failure.
 * @param {number} delay The initial delay between retries in ms.
 * @returns {Promise<object>} The JSON response from the backend.
 */
async function callGoogleScript(action, payload = {}, retries = 3, delay = 1000) {
    showLoader();
    for (let i = 0; i <= retries; i++) {
        try {
            const response = await fetch(WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload }),
                redirect: 'follow'
            });

            if (!response.ok) {
                // For server-side errors (like 500), we can retry
                if (response.status >= 500) {
                    throw new Error(`خطأ من الخادم (الحالة: ${response.status}). يتم الآن إعادة المحاولة...`);
                }
                // For client-side errors (like 4xx), no point in retrying
                throw new Error(`استجابة الشبكة غير صالحة: ${response.statusText}`);
            }
            
            const result = await response.json();

            if (result.status === 'error') {
                // This is a controlled error from our script, no need to retry
                throw new Error(result.message);
            }
            
            // If successful, hide loader and return result
            hideLoader();
            return result;

        } catch (error) {
            console.warn(`Attempt ${i + 1} for action "${action}" failed:`, error.message);
            
            // If this was the last retry, show final error and stop
            if (i === retries) {
                hideLoader();
                // Provide a more user-friendly message for the common "Failed to fetch" error
                const finalMessage = error.message.includes('fetch') 
                    ? 'فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.'
                    : `حدث خطأ: ${error.message}`;
                showMessage(finalMessage, 'error', 8000);
                throw error; // Propagate the error to stop further execution
            }

            // Wait for the delay period before the next retry
            await new Promise(res => setTimeout(res, delay));
            // Double the delay for the next attempt (exponential backoff)
            delay *= 2;
        }
    }
}


// =======================================================================
//                      UI Helper Functions
// =======================================================================
const showLoader = () => document.getElementById('loader').classList.remove('hidden');
const hideLoader = () => document.getElementById('loader').classList.add('hidden');

function showMessage(message, type = 'info', duration = 5000) {
    const messageArea = document.getElementById('messageArea');
    const alertType = type === 'error' ? 'error' : (type === 'success' ? 'success' : 'info');
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${alertType}`;
    alertDiv.textContent = message;
    messageArea.innerHTML = ''; // Clear previous messages
    messageArea.appendChild(alertDiv);

    setTimeout(() => {
        alertDiv.style.opacity = '0';
        alertDiv.addEventListener('transitionend', () => alertDiv.remove());
    }, duration);
}

const openModal = (modalId) => document.getElementById(modalId).style.display = 'flex';
const closeModal = (modalId) => document.getElementById(modalId).style.display = 'none';

const formatCell = (data) => {
    if (data === null || typeof data === 'undefined' || data === '') return 'لا يوجد';
    return String(data).replace(/\n/g, '<br>'); // Use <br> for HTML rendering
};

// =======================================================================
//                          Initial Load
// =======================================================================
function loadInitialData() {
    callGoogleScript('getInitialData')
        .then(response => {
            populateDepartmentFilter(response.departments);
            loadPublicSchedules(); // Load schedules for the first time if a department is selected
        })
        .catch(error => {
            // Error is already handled by callGoogleScript, just log for debugging
            console.error("Failed to load initial data:", error);
            const select = document.getElementById('departmentFilter');
            select.innerHTML = '<option>فشل التحميل</option>';
            select.disabled = true;
        });
}


// =======================================================================
//                          Public View Functions
// =======================================================================
function populateDepartmentFilter(depts) {
    const select = document.getElementById('departmentFilter');
    if (!select) return;

    select.innerHTML = '<option value="">-- يرجى الاختيار --</option>';

    if (!depts || depts.length === 0) {
        select.disabled = true;
        select.innerHTML = '<option>لا توجد أقسام متاحة</option>';
        return;
    }

    depts.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept;
        option.textContent = dept;
        select.appendChild(option);
    });
    select.disabled = false;
}

function loadPublicSchedules() {
    const selectedDept = document.getElementById('departmentFilter').value;
    const container = document.getElementById('publicSchedulesContainer');
    container.innerHTML = '';
    if (!selectedDept) {
        return;
    }
    
    callGoogleScript('getPublicSchedules', { department: selectedDept })
        .then(response => {
            container.innerHTML = renderScheduleCards(response.data, false, true);
        })
        .catch(error => container.innerHTML = `<div class="alert alert-error">فشل تحميل الجداول.</div>`);
}

// =======================================================================
//                          Authentication
// =======================================================================
function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    callGoogleScript('userLogin', { username, password })
        .then(response => {
            currentUser = response;
            closeModal('loginModal');
            document.getElementById('publicViewContainer').classList.add('hidden');
            document.getElementById('login-icon-btn').classList.add('hidden');
            document.getElementById('appContainer').classList.remove('hidden');

            if (currentUser.role === 'admin') {
                document.getElementById('adminDashboardView').classList.remove('hidden');
                document.getElementById('dashboardView').classList.add('hidden');
                document.getElementById('adminWelcomeMessage').innerHTML = `مرحباً <strong>${currentUser.username}</strong> (مدير النظام)`;
                showUserManagementView();
            } else {
                document.getElementById('dashboardView').classList.remove('hidden');
                document.getElementById('adminDashboardView').classList.add('hidden');
                document.getElementById('welcomeMessage').textContent = `مرحباً، ${currentUser.username}`;
                showAddScheduleView();
            }
        })
        .catch(error => {
           // Error message is already shown by callGoogleScript, just log it.
           console.error("Login failed:", error);
        });
}

function logout() {
    currentUser = null;
    document.getElementById('appContainer').classList.add('hidden');
    document.getElementById('dashboardView').classList.add('hidden');
    document.getElementById('adminDashboardView').classList.add('hidden');
    document.getElementById('publicViewContainer').classList.remove('hidden');
    document.getElementById('login-icon-btn').classList.remove('hidden');
    document.getElementById('loginForm').reset();
}

// =======================================================================
//                      Employee Dashboard Functions
// =======================================================================
function showAddScheduleView() {
    // UI logic to activate correct button
    document.getElementById('showAddScheduleBtn').classList.replace('btn-secondary', 'btn-primary');
    document.getElementById('showPreviousSchedulesBtn').classList.replace('btn-primary', 'btn-secondary');
    
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = `
        <h2>إضافة جدول جديد</h2>
        <p>القسم: <strong>${currentUser.departmentId}</strong></p>
        <div class="form-group">
            <label for="weekStartDate">اختر تاريخ بداية الأسبوع (يجب أن يكون يوم أحد)</label>
            <input type="date" id="weekStartDate">
        </div>
        <div id="scheduleTableContainer"></div>
        <button class="btn btn-success hidden" id="saveScheduleBtn">حفظ وإرسال للمراجعة</button>`;
    
    // Set min date for the date picker
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day; 
    const minDate = new Date(today.setDate(diff));
    document.getElementById('weekStartDate').min = minDate.toISOString().split("T")[0];

    // Add event listeners for the new elements
    document.getElementById('weekStartDate').addEventListener('change', (e) => handleDateChange(e.target));
    document.getElementById('saveScheduleBtn').addEventListener('click', submitSchedule);
}

function showPreviousSchedulesView() {
    document.getElementById('showPreviousSchedulesBtn').classList.replace('btn-secondary', 'btn-primary');
    document.getElementById('showAddScheduleBtn').classList.replace('btn-primary', 'btn-secondary');
    const contentArea = document.getElementById('contentArea');
    contentArea.innerHTML = '';

    callGoogleScript('getPreviousSchedules', { departmentId: currentUser.departmentId })
        .then(response => {
            contentArea.innerHTML = '<h2>الجداول التي قمت بتقديمها</h2>' + renderScheduleCards(response.data);
        })
        .catch(error => contentArea.innerHTML = `<div class="alert alert-error">فشل تحميل الجداول السابقة.</div>`);
}

function handleDateChange(dateInput) {
    const selectedDateStr = dateInput.value;
    const tableContainer = document.getElementById('scheduleTableContainer');
    const saveBtn = document.getElementById('saveScheduleBtn');

    const clearForm = () => {
        if (tableContainer) tableContainer.innerHTML = '';
        if (saveBtn) saveBtn.classList.add('hidden');
    };

    if (!selectedDateStr) {
        clearForm();
        return;
    }

    const selectedDate = new Date(`${selectedDateStr}T00:00:00`); // Ensure local time
    if (selectedDate.getDay() !== 0) {
        showMessage('خطأ: يرجى اختيار يوم أحد لبداية الأسبوع.', 'error');
        dateInput.value = '';
        clearForm();
        return;
    }
    
    callGoogleScript('checkIfScheduleExists', { date: selectedDateStr, username: currentUser.username })
        .then(response => {
            if (response.exists) {
                showMessage('يوجد جدول مسجل لهذا الأسبوع بالفعل. يمكنك تعديله من صفحة "الجداول المقدمة".', 'warning');
                clearForm();
            } else {
                generateScheduleTable(selectedDate);
                if (saveBtn) saveBtn.classList.remove('hidden');
            }
        })
        .catch(error => console.error("Error checking schedule:", error));
}

function generateScheduleTable(startDate, dailyDoctors = null) {
    const container = document.getElementById('scheduleTableContainer');
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    let tableHtml = `<table><thead><tr><th>اليوم</th><th>التاريخ</th><th>الأطباء</th></tr></thead><tbody>`;

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate.getTime());
        currentDate.setDate(startDate.getDate() + i);
        const formattedDate = currentDate.toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit'});

        let doctorInputsHtml = '';
        const doctorsForDay = (dailyDoctors && dailyDoctors[i]) ? dailyDoctors[i].split('\n').filter(name => name.trim()) : [];
        
        if (doctorsForDay.length > 0) {
            doctorsForDay.forEach(doctorName => {
                doctorInputsHtml += `<div class="doctor-input-group" style="display: flex; gap: 5px; margin-bottom: 5px;"><input type="text" value="${doctorName.replace(/"/g, '&quot;')}"><button type="button" class="btn-remove-doctor">×</button></div>`;
            });
        } else {
            doctorInputsHtml = `<div class="doctor-input-group" style="display: flex; gap: 5px; margin-bottom: 5px;"><input type="text" placeholder="اسم الطبيب"></div>`;
        }

        tableHtml += `
            <tr>
                <td>${dayNames[i]}</td>
                <td>${formattedDate}</td>
                <td>
                    <div class="doctor-inputs" id="doctors-day-${i}">${doctorInputsHtml}</div>
                    <button type="button" class="btn btn-success btn-sm btn-add-doctor" data-day-index="${i}">+ إضافة طبيب</button>
                </td>
            </tr>`;
    }
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;

    // Add event listeners for dynamic buttons
    container.querySelectorAll('.btn-add-doctor').forEach(btn => btn.addEventListener('click', (e) => addDoctorInput(e.target.dataset.dayIndex)));
    container.querySelectorAll('.btn-remove-doctor').forEach(btn => btn.addEventListener('click', (e) => e.target.parentElement.remove()));
}

function addDoctorInput(dayIndex) {
    const container = document.getElementById(`doctors-day-${dayIndex}`);
    const div = document.createElement('div');
    div.className = 'doctor-input-group';
    div.style.cssText = 'display: flex; gap: 5px; margin-bottom: 5px;';
    div.innerHTML = `<input type="text" placeholder="اسم الطبيب"><button type="button" class="btn-remove-doctor">×</button>`;
    div.querySelector('.btn-remove-doctor').addEventListener('click', (e) => e.target.parentElement.remove());
    container.appendChild(div);
}

function submitSchedule() {
    const weekStartDate = document.getElementById('weekStartDate').value;
    const dailyDoctors = [];
    for (let i = 0; i < 7; i++) {
        const inputs = document.querySelectorAll(`#doctors-day-${i} input`);
        const doctorsForDay = Array.from(inputs).map(input => input.value.trim()).filter(name => name);
        dailyDoctors.push(doctorsForDay.join('\n'));
    }
    const scheduleData = {
        employeeName: currentUser.username,
        departmentId: currentUser.departmentId,
        weekStartDate: weekStartDate,
        dailyDoctors: dailyDoctors
    };

    callGoogleScript('submitSchedule', scheduleData)
        .then(response => {
            showMessage(response.message, 'success');
            showAddScheduleView(); // Reset the view
        })
        .catch(error => console.error("Error submitting schedule:", error));
}


// =======================================================================
//                    Admin Dashboard Functions
// =======================================================================
function setActiveAdminButton(activeBtnId) {
    ['showUserManagementBtn', 'showScheduleReviewBtn', 'showWeeklySummaryBtn'].forEach(id => {
        const btn = document.getElementById(id);
        btn.classList.toggle('btn-primary', id === activeBtnId);
        btn.classList.toggle('btn-secondary', id !== activeBtnId);
    });
}

function showUserManagementView() {
    setActiveAdminButton('showUserManagementBtn');
    const contentArea = document.getElementById('adminContentArea');
    contentArea.innerHTML = `
        <h2>إدارة الموظفين</h2>
        <div class="schedule-card">
            <h3>إضافة موظف جديد</h3>
            <form id="addUserForm" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; align-items: end;">
                <div class="form-group"><label for="new-username">اسم الموظف</label><input type="text" id="new-username" required></div>
                <div class="form-group"><label for="new-password">الرمز</label><input type="text" id="new-password" required></div>
                <div class="form-group"><label for="new-department">القسم</label><input type="text" id="new-department" required></div>
                <div class="form-group"><label for="new-telegramId">معرف التليجرام</label><input type="text" id="new-telegramId"></div>
                <button type="submit" class="btn btn-success">إضافة</button>
            </form>
        </div>
        <div id="userListContainer"></div>`;
    
    document.getElementById('addUserForm').addEventListener('submit', handleAddUser);
    loadUsers();
}

function showScheduleReviewView() {
    setActiveAdminButton('showScheduleReviewBtn');
    const contentArea = document.getElementById('adminContentArea');
    contentArea.innerHTML = `
        <h2>مراجعة الجداول</h2>
        <div class="dashboard-buttons" style="justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-warning filter-btn" data-status="قيد المراجعة (تم التعديل)">المعدلة <span id="count-modified" class="count-badge">0</span></button>
            <button class="btn btn-warning filter-btn" data-status="قيد المراجعة">قيد المراجعة <span id="count-pending" class="count-badge">0</span></button>
            <button class="btn btn-success filter-btn" data-status="تمت الموافقة">الموافق عليها <span id="count-approved" class="count-badge">0</span></button>
            <button class="btn btn-danger filter-btn" data-status="تم الرفض">المرفوضة <span id="count-rejected" class="count-badge">0</span></button>
            <button class="btn btn-light filter-btn" data-status="الكل">عرض الكل <span id="count-all" class="count-badge">0</span></button>
        </div>
        <div id="schedulesReviewContainer"></div>`;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => loadFilteredSchedules(e.currentTarget.dataset.status));
    });

    updateScheduleCounts();
    loadFilteredSchedules(currentAdminFilter);
}

function showWeeklySummaryView() {
    setActiveAdminButton('showWeeklySummaryBtn');
    const contentArea = document.getElementById('adminContentArea');
    contentArea.innerHTML = `
        <h2>خلاصة إرسال الجداول الأسبوعية</h2>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 5px;">
          <button id="prevWeekBtn" class="btn btn-primary">الأسبوع السابق</button>
          <h3 id="summaryWeekHeader" style="margin: 0;"></h3>
          <button id="nextWeekBtn" class="btn btn-primary">الأسبوع التالي</button>
        </div>
        <div id="summaryContainer"></div>`;
    
    document.getElementById('prevWeekBtn').addEventListener('click', () => navigateSummaryWeek(-1));
    document.getElementById('nextWeekBtn').addEventListener('click', () => navigateSummaryWeek(1));

    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    currentSummaryDate = new Date(today.setDate(diff));
    loadWeeklySummary(currentSummaryDate);
}


// =======================================================================
//                  Admin Function Handlers
// =======================================================================
// USER MANAGEMENT
function loadUsers() {
    const container = document.getElementById('userListContainer');
    container.innerHTML = '<p>جاري تحميل الموظفين...</p>';
    callGoogleScript('getUsers')
        .then(response => {
            const users = response.data;
            let tableHtml = `<h3>قائمة الموظفين</h3><table><thead><tr><th>اسم الموظف</th><th>القسم</th><th>معرف التليجرام</th><th>الإجراءات</th></tr></thead><tbody>`;
            if (users && users.length > 0) {
                users.forEach(user => {
                    const [name, , department, telegramId] = user;
                    const safeTelegramId = telegramId || 'لا يوجد';
                    tableHtml += `
                        <tr>
                            <td>${name}</td>
                            <td>${department}</td>
                            <td>${safeTelegramId}</td>
                            <td class="actions-cell" style="display: flex; gap: 5px;">
                                <button class="btn btn-warning btn-sm btn-edit-user" data-username="${name}" data-department="${department}" data-telegram="${telegramId || ''}">تعديل</button>
                                <button class="btn btn-danger btn-sm btn-delete-user" data-username="${name}">حذف</button>
                            </td>
                        </tr>`;
                });
            } else {
                tableHtml += '<tr><td colspan="4">لا يوجد موظفين لعرضهم.</td></tr>';
            }
            tableHtml += '</tbody></table>';
            container.innerHTML = tableHtml;
            // Add event listeners for new buttons
            container.querySelectorAll('.btn-edit-user').forEach(btn => btn.addEventListener('click', e => openEditUserModal(e.target.dataset.username, e.target.dataset.department, e.target.dataset.telegram)));
            container.querySelectorAll('.btn-delete-user').forEach(btn => btn.addEventListener('click', e => handleDeleteUser(e.target.dataset.username)));
        })
        .catch(error => container.innerHTML = '<div class="alert alert-error">فشل تحميل المستخدمين.</div>');
}

function handleAddUser(event) {
    event.preventDefault();
    const userData = {
        name: document.getElementById('new-username').value,
        password: document.getElementById('new-password').value,
        department: document.getElementById('new-department').value,
        telegramId: document.getElementById('new-telegramId').value,
    };
    callGoogleScript('addUser', userData)
        .then(response => {
            showMessage(response.message, 'success');
            document.getElementById('addUserForm').reset();
            loadUsers();
        })
        .catch(error => console.error("Error adding user:", error));
}

function openEditUserModal(username, department, telegramId) {
    document.getElementById('edit-original-username').value = username;
    document.getElementById('edit-username').value = username;
    document.getElementById('edit-password').value = '';
    document.getElementById('edit-department').value = department;
    document.getElementById('edit-telegramId').value = telegramId;
    openModal('editUserModal');
}

function handleUpdateUser(event) {
    event.preventDefault();
    const userData = {
        originalName: document.getElementById('edit-original-username').value,
        newName: document.getElementById('edit-username').value,
        newPassword: document.getElementById('edit-password').value,
        newDepartment: document.getElementById('edit-department').value,
        newTelegramId: document.getElementById('edit-telegramId').value,
    };
    callGoogleScript('updateUser', userData)
        .then(response => {
            showMessage(response.message, 'success');
            closeModal('editUserModal');
            loadUsers();
        })
        .catch(error => console.error("Error updating user:", error));
}

function handleDeleteUser(username) {
    if (confirm(`هل أنت متأكد من حذف الموظف "${username}"؟`)) {
        callGoogleScript('deleteUser', { username: username })
            .then(response => {
                showMessage(response.message, 'success');
                loadUsers();
            })
            .catch(error => console.error("Error deleting user:", error));
    }
}


// SCHEDULE REVIEW
function updateScheduleCounts() {
     callGoogleScript('getScheduleCounts')
        .then(response => {
            const counts = response.data;
            document.getElementById('count-modified').textContent = counts.modified;
            document.getElementById('count-pending').textContent = counts.pending;
            document.getElementById('count-approved').textContent = counts.approved;
            document.getElementById('count-rejected').textContent = counts.rejected;
            document.getElementById('count-all').textContent = counts.all;
        })
        .catch(error => console.error("Could not update counts:", error));
}

function loadFilteredSchedules(status) {
    currentAdminFilter = status;
    const container = document.getElementById('schedulesReviewContainer');
    if (container) container.innerHTML = '';
    
    callGoogleScript('getPendingSchedules', { status: status })
        .then(response => {
            if (container) container.innerHTML = renderScheduleCards(response.data, true);
        })
        .catch(error => {
            if (container) container.innerHTML = `<div class="alert alert-error">فشل تحميل الجداول.</div>`;
        });
}


// WEEKLY SUMMARY
function navigateSummaryWeek(direction) {
    currentSummaryDate.setDate(currentSummaryDate.getDate() + (7 * direction));
    loadWeeklySummary(currentSummaryDate);
}

function loadWeeklySummary(date) {
    const dateString = date.toISOString().split("T")[0];
    
    const header = document.getElementById('summaryWeekHeader');
    const weekStart = new Date(date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    header.textContent = `أسبوع: ${weekStart.toLocaleDateString('ar-EG-u-nu-latn')} - ${weekEnd.toLocaleDateString('ar-EG-u-nu-latn')}`;

    callGoogleScript('getWeeklySummary', { date: dateString })
        .then(response => {
            const summaryData = response.data;
            const container = document.getElementById('summaryContainer');
            if (!summaryData || summaryData.length === 0) {
                container.innerHTML = '<p>لا توجد أقسام معرفة لعرض الخلاصة.</p>';
                return;
            }

            let tableHtml = '<table><thead><tr><th>القسم</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>';
            summaryData.forEach(item => {
                const statusText = item.hasSubmitted ? '<span style="color: green; font-weight: bold;">تم الإرسال</span>' : '<span style="color: red; font-weight: bold;">لم يتم الإرسال</span>';
                const actionButton = item.hasSubmitted ? '' : `<button class="btn btn-warning btn-sm btn-send-alert" data-department="${item.departmentName}" data-date="${dateString}">إرسال تنبيه</button>`;
                tableHtml += `<tr><td>${item.departmentName}</td><td>${statusText}</td><td>${actionButton}</td></tr>`;
            });
            tableHtml += '</tbody></table>';
            container.innerHTML = tableHtml;

            container.querySelectorAll('.btn-send-alert').forEach(btn => btn.addEventListener('click', e => {
                const { department, date } = e.target.dataset;
                handleSendAlert(e.target, department, date);
            }));
        })
        .catch(error => {
            document.getElementById('summaryContainer').innerHTML = `<div class="alert alert-error">فشل تحميل الخلاصة.</div>`;
        });
}

function handleSendAlert(button, departmentName, weekStartDateStr) {
    button.disabled = true;
    button.textContent = 'جارٍ الإرسال...';

    callGoogleScript('sendTelegramAlert', { departmentName, weekStartDate: weekStartDateStr })
        .then(response => {
            showMessage(response.message, response.status || 'info');
             if (response.status === 'success') {
                button.textContent = 'تم الإرسال ✅';
             } else {
                button.disabled = false;
                button.textContent = 'إرسال تنبيه';
             }
        })
        .catch(error => {
            button.disabled = false;
            button.textContent = 'إرسال تنبيه';
        });
}

// =======================================================================
//                   Card Rendering & Actions
// =======================================================================
function handleScheduleAction(requestId, action) {
    const actionTexts = { approve: 'موافقة على', reject: 'رفض', delete: 'حذف' };
    if (!confirm(`هل أنت متأكد أنك تريد ${actionTexts[action]} هذا الجدول؟`)) return;

    let actionFunction;
    switch(action) {
        case 'approve': actionFunction = 'approveSchedule'; break;
        case 'reject': actionFunction = 'rejectSchedule'; break;
        case 'delete': actionFunction = 'deleteSchedule'; break;
        default: return;
    }
    
    callGoogleScript(actionFunction, { requestId: requestId })
        .then(response => {
            showMessage(response.message, 'success');
            loadFilteredSchedules(currentAdminFilter);
            updateScheduleCounts();
        })
        .catch(error => console.error(`Action ${action} failed:`, error));
}


function renderScheduleCards(schedules, isAdminView = false, isPublicView = false) {
    if (!schedules || schedules.length === 0) {
        return `<div class="alert alert-info"><p><strong>لا توجد جداول لعرضها حالياً.</strong></p></div>`;
    }
    
    let html = '';
    schedules.forEach(s => {
        const [requestId, departmentId, startDate, sun, mon, tue, wed, thu, fri, sat, submitter, status, submissionDate] = s;
        const safeStatus = status || 'غير معروف';
        const statusClass = safeStatus.replace(/[()\s+]/g, '-');
        const cardId = `card-${requestId || Math.random().toString(36).substr(2, 9)}`;
        const formattedSubmissionDate = submissionDate ? new Date(submissionDate).toLocaleString('ar-EG') : 'N/A';
        const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('ar-EG-u-nu-latn') : 'غير محدد';
        
        html += `
            <div id="${cardId}" class="schedule-card status-${statusClass}">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                    <h3>أسبوع ${formattedStartDate}</h3>
                    <span class="status-badge status-${statusClass}">${safeStatus}</span>
                </div>`;
        
        if (!isPublicView) {
            html += `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; font-size: 14px; margin-bottom: 15px;">
                    <p><strong>القسم:</strong> ${departmentId || 'N/A'}</p>
                    <p><strong>مقدم الطلب:</strong> ${submitter || 'N/A'}</p>
                    <p><strong>تاريخ التقديم:</strong> ${formattedSubmissionDate}</p>
                    <p><strong>رقم الطلب:</strong> ${requestId || 'N/A'}</p>
                </div>`;
        }

        html += `
            <h4>جدول الأطباء:</h4>
            <table style="font-size: 13px;">
                <tr><td><strong>الأحد:</strong></td><td>${formatCell(sun)}</td></tr>
                <tr><td><strong>الاثنين:</strong></td><td>${formatCell(mon)}</td></tr>
                <tr><td><strong>الثلاثاء:</strong></td><td>${formatCell(tue)}</td></tr>
                <tr><td><strong>الأربعاء:</strong></td><td>${formatCell(wed)}</td></tr>
                <tr><td><strong>الخميس:</strong></td><td>${formatCell(thu)}</td></tr>
                <tr><td><strong>الجمعة:</strong></td><td>${formatCell(fri)}</td></tr>
                <tr><td><strong>السبت:</strong></td><td>${formatCell(sat)}</td></tr>
            </table>
            <div class="admin-actions" style="display: flex; gap: 10px; margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px; flex-wrap: wrap;">`;
        
        if (isAdminView) {
            if (safeStatus === 'قيد المراجعة' || safeStatus === 'قيد المراجعة (تم التعديل)') {
                html += `<button class="btn btn-success btn-sm" onclick="handleScheduleAction('${requestId}', 'approve')">موافقة</button>
                         <button class="btn btn-danger btn-sm" onclick="handleScheduleAction('${requestId}', 'reject')">رفض</button>`;
            }
             html += `<button class="btn btn-secondary btn-sm" onclick="handleScheduleAction('${requestId}', 'delete')" style="margin-right: auto;">حذف الطلب</button>`;
        }
        
        // This button is for employees only
        if (!isAdminView && !isPublicView && (safeStatus === 'تم الرفض')) {
            // Future feature: add edit button if needed
            // html += `<button class="btn btn-warning btn-sm" onclick="showEditScheduleView('${requestId}')">تعديل وإعادة الإرسال</button>`;
        }
        
        // Print button for all non-public views
         if (isPublicView || isAdminView) {
             html += `<button class="btn btn-light btn-sm print-btn" onclick="printSchedule('${cardId}')">طباعة</button>`;
         }

        html += `</div></div>`;
    });
    return html;
}

function printSchedule(cardId) {
    const cardElement = document.getElementById(cardId);
    if (!cardElement) return;

    const contentToPrint = cardElement.cloneNode(true);
    // Remove all buttons and action areas
    contentToPrint.querySelectorAll('.admin-actions').forEach(el => el.remove());
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(\`
        <html>
            <head>
                <title>طباعة الجدول</title>
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap">
                <style>
                    body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                    th { background-color: #f2f2f2; }
                    h3, h4, p { margin: 5px 0; color: #333; }
                    .status-badge { display: inline-block; padding: 4px 10px; border-radius: 12px; color: white; margin-bottom: 10px; }
                    .status-badge.status-تمت-الموافقة { background-color: #28a745; }
                    /* Add other status styles as needed */
                </style>
            </head>
            <body>
                \${contentToPrint.innerHTML}
            </body>
        </html>\`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250); // Wait for content to load
}

