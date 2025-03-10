let diaryEntries = [];
let currentPage = 0;
const username = sessionStorage.getItem("username");
const diaryOwner = getQueryParam("user") || sessionStorage.getItem("username");
const loggedInUser = sessionStorage.getItem("username");
const isReadOnly = diaryOwner !== loggedInUser;

const diaryPageId = getQueryParam("diaryPageId"); // Get diary page ID from URL

if (diaryPageId) {
    currentPage = diaryEntries.findIndex(e => e.id == diaryPageId); // Set the page to the correct diary entry
    if (currentPage === -1) currentPage = 0; // Fallback if page not found
}

// ✅ Load Diary Entries from MySQL
// ✅ Load Diary Entries
async function loadDiary() {
    try {
        const response = await fetch(`/get-diary?user=${diaryOwner}`);
        const data = await response.json();
        if (data.success) {
            diaryEntries = data.entries;
            document.getElementById("diaryTitle").textContent = `${diaryOwner}'s Diary`;
            loadEntry();
            setReadOnlyMode(); // ✅ Apply Read-Only Mode
        } else {
            console.error("Error loading diary:", data.error);
        }
    } catch (error) {
        console.error("Error fetching diary:", error);
    }
}
function setReadOnlyMode() {
    if (isReadOnly) {
        document.getElementById("diaryText").setAttribute("readonly", true);
        const ownerButtons = document.getElementById("ownerButtons");
        if (ownerButtons) {
            ownerButtons.remove();
        }
    }
}
// ✅ Load a Specific Page
function loadEntry() {
    const entry = diaryEntries.find(e => e.page_number === currentPage);
    document.getElementById("diaryImage").src = entry ? entry.image_url : "";
    document.getElementById("diaryText").value = entry ? entry.text_content : "";
     document.getElementById("pageNumber").textContent = `Page ${currentPage + 1}`;
}

// ✅ Upload Image to Server
async function uploadImage() {
    const fileInput = document.getElementById("imageUpload");
    if (!fileInput.files[0]) return;

    const formData = new FormData();
    formData.append("image", fileInput.files[0]);

    try {
        const response = await fetch("/upload-diary-image", {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            document.getElementById("diaryImage").src = data.imageUrl;
        } else {
            alert("Error uploading image");
        }
    } catch (error) {
        console.error("Error uploading image:", error);
    }
}

// ✅ Save Entry to MySQL
async function saveEntry() {
    const image = document.getElementById("diaryImage").src;
    const text = document.getElementById("diaryText").value;

    try {
        const response = await fetch("/save-diary", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user: username, page_number: currentPage, image_url: image, text_content: text })
        });

        const data = await response.json();
        if (data.success) {
            alert("Diary entry saved!");
            loadDiary(); // Reload entries after saving
        } else {
            console.error("Error saving diary:", data.error);
        }
    } catch (error) {
        console.error("Error saving entry:", error);
    }
}

// ✅ Navigate Pages
function nextPage() {
    currentPage++;
    loadEntry();
}

function prevPage() {
    if (currentPage > 0) {
        currentPage--;
        loadEntry();
    }
}

// ✅ Load Diary on Page Load
loadDiary();
// ✅ Use the same function from chatbox to open images in modal
function openModal(fileUrl, fileType) {
    const modal = document.getElementById("mediaModal");
    const modalImage = document.getElementById("modalImage");
    const modalVideo = document.getElementById("modalVideo");

    if (fileType === "image") {
        modalImage.src = fileUrl;
        modalImage.style.display = "block";
        modalVideo.style.display = "none";
    } else {
        modalVideo.src = fileUrl;
        modalVideo.style.display = "block";
        modalImage.style.display = "none";
    }

    modal.style.display = "flex";
}

// ✅ Use the same function to close the modal
function closeModal() {
    document.getElementById("mediaModal").style.display = "none";
    document.getElementById("modalImage").src = "";
    document.getElementById("modalVideo").src = "";
}
// ✅ Delete Current Diary Page
// ✅ Delete Current Diary Page and Shift Others
async function deletePage() {
    if (!confirm("⚠️ Are you sure you want to delete this page permanently?")) {
        return; // Stop if user cancels
    }

    const user = sessionStorage.getItem("username");
    const pageNumber = currentPage;

    try {
        const response = await fetch("/delete-diary-page", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user, page_number: pageNumber })
        });

        const data = await response.json();
        if (data.success) {
            alert("✅ Page deleted and pages reordered!");

            // Reload the diary entries from the server
            await loadDiary();

            // Go to the previous page after deletion
            if (currentPage >= diaryEntries.length) {
                currentPage = diaryEntries.length - 1;
            }
            loadEntry();
        } else {
            alert("❌ Error deleting page. Try again.");
        }
    } catch (error) {
        console.error("Error deleting diary page:", error);
        alert("❌ Server error while deleting page.");
    }
}
// ✅ Close Diary and Return to Profile Page
// ✅ Function to Get URL Parameters
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}
// ✅ Open Profile
function openProfile() {
    window.location.href = `profile.html?user=${encodeURIComponent(diaryOwner)}`;
}

// ✅ Close Diary and Go Back to Profile
function closeDiary() {
    const profileUser = getQueryParam("user") || sessionStorage.getItem("username");
    
    if (!profileUser) {
        alert("Error: No username found.");
        return;
    }

    window.location.href = `profile.html?user=${encodeURIComponent(profileUser)}`;
}

async function openCommentPage() {
    const currentPageId = diaryEntries[currentPage]?.id;
    const loggedInUser = sessionStorage.getItem("username");

    if (!currentPageId) {
        console.error("❌ No diary page ID found.");
        return;
    }

    // ✅ Hide badge instantly in UI
    document.getElementById("commentBadge").style.display = "none";

    // ✅ Only the diary owner can mark comments as read
    if (loggedInUser === diaryOwner) {
        try {
            await fetch(`/mark-comments-read`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ diaryPageId: currentPageId, user: loggedInUser }) // ✅ Ensure correct user
            });
        } catch (error) {
            console.error("❌ Error marking comments as read:", error);
        }
    }

    // ✅ Redirect to comments page
    window.location.href = `comments.html?diaryPageId=${currentPageId}&user=${diaryOwner}`;
}



async function checkUnreadComments() {
    const loggedInUser = sessionStorage.getItem("username"); // Get the logged-in user

    // ✅ Only show badge if the logged-in user is the diary owner
    if (loggedInUser !== diaryOwner) return;

    try {
        const response = await fetch(`/get-unread-comments?user=${diaryOwner}`);
        const data = await response.json();

        if (data.success && data.unreadCount > 0) {
            const badge = document.getElementById("commentBadge");
            badge.innerText = data.unreadCount;
            badge.style.display = "inline-block"; // ✅ Show badge only if there are unread comments
        }
    } catch (error) {
        console.error("❌ Error fetching unread comments:", error);
    }
}

// ✅ Call this function when diary loads
loadDiary().then(checkUnreadComments);


