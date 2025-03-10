function getDiaryPageId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("diaryPageId");
}
// ✅ Load Comments
async function loadComments() {
    const diaryPageId = getDiaryPageId();
    const loggedInUser = sessionStorage.getItem("username");

    if (!diaryPageId) {
        console.error("❌ No diary page ID provided.");
        return;
    }

    try {
        const response = await fetch(`/get-comments?diaryPageId=${diaryPageId}`);
        const data = await response.json();

        if (data.success) {
            const commentList = document.getElementById("commentList");
            commentList.innerHTML = "";

            data.comments.forEach(comment => {
                const commentDiv = document.createElement("div");
                commentDiv.classList.add("comment");

                // ✅ Format timestamp
                const timestamp = new Date(comment.timestamp).toLocaleString();

                // ✅ Create comment structure
                commentDiv.innerHTML = `
                    <div class="comment-header">
                        <strong>${comment.username}</strong>
                        <span class="comment-timestamp">${timestamp}</span>
                    </div>
                    <p>${comment.text}</p>
                `;

                // ✅ Show delete button only if the logged-in user posted this comment
                if (loggedInUser === comment.username) {
                    const deleteButton = document.createElement("button");
                    deleteButton.innerText = "Delete";
                    deleteButton.classList.add("delete-comment-btn");
                    deleteButton.onclick = () => deleteComment(comment.id);
                    commentDiv.appendChild(deleteButton);
                }

                commentList.appendChild(commentDiv);
            });
        }
    } catch (error) {
        console.error("❌ Error loading comments:", error);
    }
}
async function deleteComment(commentId) {
    const username = sessionStorage.getItem("username");

    if (!confirm("Are you sure you want to delete this comment?")) return;

    try {
        await fetch("/delete-comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentId, username })
        });

        loadComments(); // ✅ Refresh comments after deletion
    } catch (error) {
        console.error("❌ Error deleting comment:", error);
    }
}

// ✅ Post Comment
async function postComment() {
    const diaryPageId = getDiaryPageId();
    const username = sessionStorage.getItem("username");
    const commentText = document.getElementById("commentText").value.trim();

    if (!diaryPageId || !username || !commentText) {
        console.error("❌ Invalid data.");
        return;
    }

    try {
        await fetch("/post-comment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ diaryPageId, username, text: commentText })
        });

        document.getElementById("commentText").value = ""; // ✅ Clear input
        loadComments(); // ✅ Reload comments
    } catch (error) {
        console.error("❌ Error posting comment:", error);
    }
}

// ✅ Close Comments Page

function closeCommentPage() {
    const diaryPageId = getDiaryPageId(); // Get diary page ID
    const diaryOwner = new URLSearchParams(window.location.search).get("user"); // Get diary owner

    if (diaryPageId && diaryOwner) {
        window.location.href = `diary.html?diaryPageId=${diaryPageId}&user=${diaryOwner}`;
    } else {
        window.location.href = "diary.html"; // Fallback if no parameters found
    }
}

// ✅ Load comments when the page opens
window.onload = loadComments;
async function loadDiaryOwner() {
    const diaryPageId = getDiaryPageId();

    if (!diaryPageId) {
        console.error("❌ No diary page ID provided.");
        return;
    }

    try {
        const response = await fetch(`/get-diary-owner?diaryPageId=${diaryPageId}`);
        const data = await response.json();

        if (data.success) {
            document.getElementById("diaryOwner").innerText = `Commenting on ${data.owner}'s Diary`;
        } else {
            document.getElementById("diaryOwner").innerText = "Diary Owner Not Found";
        }
    } catch (error) {
        console.error("❌ Error fetching diary owner:", error);
    }
}

// ✅ Load diary owner when the page loads
window.onload = function () {
    loadDiaryOwner();
    loadComments();
};
