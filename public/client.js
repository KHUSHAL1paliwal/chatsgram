const socket = io("http://localhost:9000"); // Connect to backend
let username = "";

function login() {
    username = document.getElementById("username").value.trim();
    if (username) {
        document.getElementById("login-container").classList.add("hidden");
        document.getElementById("chat-container").classList.remove("hidden");
        socket.emit("join", username);
    }
}


function sendMessage() {
    const message = document.getElementById("message").value.trim();
    if (message) {
        socket.emit("send-message", { sender: username, message });
        document.getElementById("message").value = "";
    }
}
socket.off("receive-message").on("receive-message", (data) => {
    const chatBox = document.getElementById("chat-box");
    const messageDiv = document.createElement("div");
    messageDiv.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
    chatBox.appendChild(messageDiv);
});

function addMessageToChat(sender, message, timestamp, isSent) {
    const chatContainer = document.getElementById("chatMessages");

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", isSent ? "sent" : "received");

    messageDiv.innerHTML = `
        <p>${message}</p>
        <span class="timestamp">${timestamp}</span>
    `;

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight; // Auto-scroll to latest message
}
function saveChatUser(user) {
    let chatUsers = JSON.parse(localStorage.getItem("chatUsers")) || [];

    if (!chatUsers.includes(user)) {
        chatUsers.push(user);
        localStorage.setItem("chatUsers", JSON.stringify(chatUsers));
    }

    loadChatList();  // 🔥 Refresh chat list instantly
}

async function loadChatList() {
    const loggedInUser = sessionStorage.getItem("username");

    if (!loggedInUser) {
        console.error("❌ No logged-in user found.");
        return;
    }

    try {
        const response = await fetch(`/chat-list?user=${loggedInUser}`);
        const data = await response.json();

        const unreadResponse = await fetch(`/get-unread-count?user=${loggedInUser}`);
        const unreadData = await unreadResponse.json();
        console.log("Unread data:", unreadData); // Debug log

        if (data.success) {
            const chatListContainer = document.getElementById("chatUsers");
            chatListContainer.innerHTML = ""; // Clear existing list

            if (data.chats.length === 0) {
                chatListContainer.innerHTML = "<p>No chats found.</p>";
                return;
            }

            for (const user of data.chats) {
                const li = document.createElement("li");

                const picResponse = await fetch(`/get-user-profile-pic?user=${user}`);
                const picData = await picResponse.json();
                const profilePic = picData.success ? picData.profilePic : "default-profile.png";

                const img = document.createElement("img");
                img.src = profilePic;
                img.alt = "Profile Pic";
                img.style.width = "40px";
                img.style.height = "40px";
                img.style.borderRadius = "50%";
                img.style.marginRight = "10px";
                img.style.objectFit = "cover";
                img.onclick = () => openModal(profilePic, "image");

                const nameSpan = document.createElement("span");
                nameSpan.textContent = user;

                const unreadCount = unreadData.success && unreadData.unread[user] ? unreadData.unread[user] : 0;
                console.log(`Badge for ${user}: ${unreadCount}`); // Debug log
                const badge = document.createElement("span");
                badge.classList.add("unread-badge");
                badge.textContent = unreadCount;
                badge.style.display = unreadCount > 0 ? "inline-block" : "none";

                li.appendChild(img);
                li.appendChild(nameSpan);
                li.appendChild(badge);
                li.onclick = () => openChat(user);

                chatListContainer.appendChild(li);
            }
        }
    } catch (error) {
        console.error("❌ Error loading chat list:", error);
    }
}

// Ensure single listener for receiveMessage
socket.off("receiveMessage");
socket.on("receiveMessage", ({ sender, receiver, message, is_read }) => {
    const currentUser = sessionStorage.getItem("username");
    console.log(`Received: ${sender} -> ${receiver}, is_read: ${is_read}`);

    if (receiver === currentUser) {
        if (sender !== selectedChatUser && is_read === 0) {
            addNotification(sender, message);
            loadChatList(); // Update badge
        } else if (is_read === 0) {
            displayMessage(sender, message, false, new Date().toISOString());
        }
    }
});

function deleteChat(user) {
    if (!confirm(`Are you sure you want to delete the chat with ${user}?`)) return;

    const loggedInUser = sessionStorage.getItem("username"); // Ensure username is retrieved

    if (!loggedInUser) {
        console.error("❌ No logged-in user found.");
        return;
    }

    console.log(`🗑 Deleting chat with ${user} for ${loggedInUser}`);

    // ✅ Remove user from chat list in local storage
    let chatUsers = JSON.parse(localStorage.getItem("chatUsers")) || [];
    chatUsers = chatUsers.filter(u => u !== user);
    localStorage.setItem("chatUsers", JSON.stringify(chatUsers));

    // ✅ Remove user from UI immediately
    loadChatList();

    // ✅ Send request to server
    fetch("/delete-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, loggedInUser }) // Sending data correctly
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            console.log(`✅ Chat with ${user} deleted successfully`);
        } else {
            console.error(`❌ Server Error: ${data.message}`);
        }
    })
    .catch(error => console.error("❌ Fetch Error:", error));
}


    // Remove from UI
    loadChatList();

    // ✅ Send request to server to delete from database
    fetch("/delete-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, loggedInUser }) })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            console.log(`✅ Chat with ${user} deleted successfully`);
            setTimeout(loadChatList, 500); // 🔄 Reload list after deletion
        } else {
            console.error(`❌ Server Error: ${data.message}`);
        }
    })
    

function openChat(user) {
    sessionStorage.setItem("selectedChatUser", user);  // 🔥 Store selected user in sessionStorage
    document.getElementById("chatUser").innerText = user;
    document.getElementById("chatMessages").innerHTML = "";
    loadChatMessages(user);
    saveChatUser(user);  // 🔥 Ensure user stays in chat list
}

loadChatList(); // 🔥 Load chat list when the page loads
socket.on("newMessage", ({ sender, message }) => {
    const currentUser = sessionStorage.getItem("username");

    if (sender !== currentUser) {
        addNotification(sender, message); // Show notification for new user
    }

    // Check if sender is already in chat list
    let chatUsers = JSON.parse(localStorage.getItem("chatUsers")) || [];
    if (!chatUsers.includes(sender)) {
        chatUsers.push(sender);
        localStorage.setItem("chatUsers", JSON.stringify(chatUsers));
        loadChatList(); // Update UI
    }
});
function loadChatUsers() {
    fetch('/chat-list')
        .then(response => response.json())
        .then(data => {
            const chatList = document.getElementById("chatUsers");
            chatList.innerHTML = "";
            data.users.forEach(user => {
                const li = document.createElement("li");
                li.textContent = user;
                li.onclick = () => openChat(user);
                chatList.appendChild(li);
            });
        })
        .catch(err => console.error("Error loading chat list:", err));
}

// Call when chatbox loads
document.addEventListener("DOMContentLoaded", loadChatUsers);

// Function to handle notifications
function addNotification(sender, message) {
    let notificationsList = document.getElementById("notificationsList");

    let li = document.createElement("li");
    li.innerHTML = `<p><b>${sender}:</b> ${message}</p>
                    <button onclick="acceptUser('${sender}')">Accept</button>
                    <button onclick="blockUser('${sender}')">Block</button>`;

    notificationsList.appendChild(li);

    let notifCount = document.getElementById("notifCount");
    notifCount.textContent = parseInt(notifCount.textContent) + 1;
}

// Accept user and add to chat list
function acceptUser(user) {
    saveChatUser(user);
    loadChatList();
    clearNotifications();
}


async function searchUser() {
    const query = document.getElementById("searchInput").value.trim();
    if (!query) {
        alert("Enter a username or email!");
        return;
    }

    try {
        const response = await fetch(`/search-user?query=${query}`);
        const data = await response.json();

        if (data.success) {
            let resultsHTML = "<h4>Results:</h4>";
            data.users.forEach(user => {
                resultsHTML += `<div class="user-box">
                    <p>${user.username} (${user.email})</p>
                    <button onclick="startChat('${user.username}')">Chat</button>
                </div>`;
            });
            document.getElementById("searchResults").innerHTML = resultsHTML;
        } else {
            alert("User not found.");
        }
    } catch (error) {
        console.error("❌ Search Error:", error);
        alert("Error searching for user.");
    }
}

function startChat(username) {
    const loggedInUser = sessionStorage.getItem("username");

    fetch('/save-chat-user', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loggedInUser, chatUser: username })
    }).then(response => response.json())
      .then(data => {
          if (data.success) {
              openChat(username);
          } else {
              alert("Failed to add user to chat list.");
          }
      })
      .catch(error => console.error("❌ Error saving chat user:", error));
}

async function sendMedia() {
    const mediaInput = document.getElementById("mediaInput").files[0];

    if (!mediaInput) {
        alert("Please select a file to upload.");
        return;
    }

    const formData = new FormData();
    formData.append("sender", sessionStorage.getItem("username"));
    formData.append("receiver", selectedChatUser);
    formData.append("file", mediaInput);

    try {
        const response = await fetch("/upload-media", {
            method: "POST",
            body: formData,
        });

        const data = await response.json();
        if (data.success) {
            const fileType = mediaInput.type.startsWith("image") ? "image" : "video";

            // Emit the uploaded file via Socket.io
            socket.emit("sendMedia", {
                sender: sessionStorage.getItem("username"),
                receiver: selectedChatUser,
                fileUrl: data.fileUrl,
                fileType
            });
            // Display media instantly for sender
            displayMediaMessage(data.fileUrl, fileType, true);
        } else {
            alert("Failed to upload media.");
        }
    } catch (error) {
        console.error("Error uploading media:", error);
    }
}


function displayMediaMessage(fileUrl, fileType, isSent) {
    const chatMessages = document.getElementById("chatMessages");
    const mediaMessage = document.createElement("div");

    mediaMessage.classList.add("message", isSent ? "sent" : "received");

    let mediaHTML = fileType === "image"
        ? `<img src="${fileUrl}" class="chat-media" onclick="openModal('${fileUrl}', 'image')">`
        : `<video src="${fileUrl}" controls class="chat-media" onclick="openModal('${fileUrl}', 'video')"></video>`;

    mediaMessage.innerHTML = `
        <p><b>${isSent ? "You" : selectedChatUser}:</b></p>
        ${mediaHTML}
    `;

    chatMessages.appendChild(mediaMessage);
}



// ✅ Listen for media messages from the server
socket.off("receiveMedia");
socket.on("receiveMedia", ({ sender, receiver, fileUrl, fileType, is_read }) => {
    const currentUser = sessionStorage.getItem("username");
    console.log(`Received media from ${sender} to ${receiver}: ${fileUrl}, is_read: ${is_read}`);

    if (receiver === currentUser) {
        if (sender !== selectedChatUser && is_read === 0) {
            addNotification(sender, "Sent a media file"); // Optional: Notify for media
            loadChatList(); // Update badge
        } else if (is_read === 0) {
            displayMediaMessage(fileUrl, fileType, false);
        }
    }
});
async function loadChatHistory() {
    if (!selectedChatUser) return;

    try {
        const response = await fetch(`/get-messages?user1=${sessionStorage.getItem("username")}&user2=${selectedChatUser}`);
        const data = await response.json();

        if (data.success) {
            const chatMessages = document.getElementById("chatMessages");
            chatMessages.innerHTML = "";

            data.messages.forEach(msg => {
                if (msg.message) {
                    chatMessages.innerHTML += `<p><b>${msg.sender}:</b> ${msg.message}</p>`;
                } else if (msg.file_url) {
                    chatMessages.innerHTML += `<p><b>${msg.sender}:</b><br> 
                        ${msg.file_type === "image" ? `<img src="${msg.file_url}" class="chat-media">` :
                        `<video src="${msg.file_url}" controls class="chat-media"></video>`}
                    </p>`;
                }
            });

            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    } catch (error) {
        console.error("❌ Error loading chat history:", error);
    }
}
function displayMessage(sender, message, isSent, timestamp) {
    const chatMessages = document.getElementById("chatMessages");
    const messageDiv = document.createElement("div");

    messageDiv.classList.add("message", isSent ? "sent" : "received");

    messageDiv.innerHTML = `
        <p><b>${isSent ? "You" : sender}:</b> ${message}</p>
        <span class="timestamp">${formatTimestamp(timestamp)}</span>
    `;

    chatMessages.appendChild(messageDiv);
}
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

function closeModal() {
    document.getElementById("mediaModal").style.display = "none";
    document.getElementById("modalImage").src = "";
    document.getElementById("modalVideo").src = "";
}



// ✅ Load chat history when opening a chat
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(loadChatHistory, 1000);
});
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString(); // Adjust format as needed
}
// ✅ Toggle the dropdown menu
function toggleMenu() {
    const menu = document.getElementById("dropdownMenu");
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
}

// ✅ Close dropdown when clicking outside
document.addEventListener("click", (event) => {
    const menu = document.getElementById("dropdownMenu");
    const button = document.querySelector(".menu-btn");

    if (menu.style.display === "block" && !menu.contains(event.target) && !button.contains(event.target)) {
        menu.style.display = "none";
    }
});

// ✅ Placeholder for Search Messages
function searchMessages() {
    alert("Search Messages functionality will be implemented.");
    document.getElementById("dropdownMenu").style.display = "none"; // Close menu
}

// ✅ Placeholder for Clear Chat
async function clearChat() {
    const confirmation = confirm("Are you sure you want to delete all messages in this chat? This will only clear the chat for you.");
    if (!confirmation) return;

    const currentUser = sessionStorage.getItem("username");

    try {
        const response = await fetch(`/clear-chat?user=${currentUser}&chatWith=${selectedChatUser}`, {
            method: "DELETE",
        });

        const data = await response.json();
        if (data.success) {
            alert("Chat cleared successfully!");
            document.getElementById("chatMessages").innerHTML = ""; // Clear chat on UI
        } else {
            alert("Failed to clear chat.");
        }
    } catch (error) {
        console.error("❌ Error clearing chat:", error);
    }
}

let localStream, remoteStream, peerConnection;
const servers = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// ✅ Start a voice call
async function startVoiceCall() {
    await startCall(false);
}

// ✅ Start a video call
async function startVideoCall() {
    await startCall(true);
}

// ✅ Start a call (common function)
async function startCall(isVideo) {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: isVideo,
            audio: true
        });

        document.getElementById("videoCallContainer").style.display = "block";
        if (isVideo) document.getElementById("localVideo").srcObject = localStream;

        socket.emit("callUser", {
            sender: sessionStorage.getItem("username"),
            receiver: selectedChatUser,
            isVideo
        });

        setupPeerConnection();
    } catch (error) {
        console.error("Error accessing media devices:", error);
    }
}

// ✅ Handle incoming call
socket.on("incomingCall", async ({ sender, isVideo }) => {
    const accept = confirm(`${sender} is calling. Accept?`);
    if (!accept) return;

    localStream = await navigator.mediaDevices.getUserMedia({
        video: isVideo,
        audio: true
    });

    document.getElementById("videoCallContainer").style.display = "block";
    if (isVideo) document.getElementById("localVideo").srcObject = localStream;

    setupPeerConnection();
    socket.emit("acceptCall", { sender, receiver: sessionStorage.getItem("username") });
});

// ✅ Setup WebRTC connection
function setupPeerConnection() {
    peerConnection = new RTCPeerConnection(servers);
    remoteStream = new MediaStream();
    document.getElementById("remoteVideo").srcObject = remoteStream;

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = event => event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track));

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("sendICE", {
                candidate: event.candidate,
                receiver: selectedChatUser
            });
        }
    };
}

// ✅ Handle ICE candidate exchange
socket.on("receiveICE", ({ candidate }) => {
    peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
});

// ✅ End the call
function endCall() {
    localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();

    document.getElementById("videoCallContainer").style.display = "none";
    socket.emit("endCall", { receiver: selectedChatUser });
}

// ✅ Handle call end from peer
socket.on("callEnded", () => {
    endCall();
});
