// Backend (Node.js + Express)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const fs = require("fs");
const Razorpay = require("razorpay");
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const users = {};  // Stores user data temporarily (should use a database instead)
const verificationCodes = {};  // Stores verification codes temporarily
const session = require('express-session');





const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        
    }
});
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-adminsdk.json");  // Ensure correct path
console.log("Firebase Admin SDK initialized successfully!");


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://chatting_app_site.firebaseio.com"
});



app.use(cors());
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.json()); // ✅ Parses JSON requests
app.use(express.urlencoded({ extended: true })); // ✅ Parses form data



app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: "paliwalkhushal27@gmail.com",
        pass: "kwbr asvn ukmq zggu"                //qklm dihl haqi xpkj        kwbr asvn ukmq zggu
    }
});


app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true } // Set `true` if using HTTPS
}));




// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "khu1212@P",
    database: "chatting_app_site",
    port: 3306
    
});



db.connect(err => {
    if (err) throw err;
    console.log('MySQL Connected');
});

// Get Chat List (All users a person has chatted with)
// Backend (Node.js)
io.on("connection", (socket) => {
    socket.on("startChat", ({ sender, receiver }) => {
        // Save chat relationship in the database
        db.query("INSERT INTO chatlist (user, chat_with) VALUES (?, ?)", [sender, receiver], (err) => {
            if (err) return console.error("Chat save error:", err);

            // Emit update to both users
            io.to(sender).emit("chatAdded", { user: receiver });
            io.to(receiver).emit("chatAdded", { user: sender });
        });
    });
});

// Real-time messaging

const razorpay = new Razorpay({
    key_id: "YOUR_KEY_ID",
    key_secret: "YOUR_KEY_SECRET",
});

app.post("/create-order", async (req, res) => {
    try {
        const options = {
            amount: req.body.amount * 100, // Amount in paisa
            currency: "INR",
            payment_capture: 1,
        };

        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (error) {
        res.status(500).send(error);
    }
});


app.get("/chat-list", (req, res) => {
    const user = req.query.user;

    if (!user) {
        return res.status(400).json({ success: false, message: "User parameter required" });
    }

    const query = `
        SELECT chat_with 
        FROM chatlist 
        WHERE user = ?
        ORDER BY (
            SELECT GREATEST(
                COALESCE((SELECT MAX(timestamp) FROM messages WHERE (sender = chat_with AND receiver = ?) OR (sender = ? AND receiver = chat_with)), '1970-01-01'),
                COALESCE((SELECT MAX(timestamp) FROM media_files WHERE (sender = chat_with AND receiver = ?) OR (sender = ? AND receiver = chat_with)), '1970-01-01')
            )
        ) DESC;
    `;

    db.query(query, [user, user, user, user, user], (err, results) => {
        if (err) {
            console.error("❌ MySQL Fetch Error:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        const chatUsers = results.map(row => row.chat_with);
        console.log(`Chat list for ${user}:`, chatUsers); // Debug log
        res.json({ success: true, chats: chatUsers });
    });
});

app.get("/get-last-message-time", (req, res) => {
    const { user1, user2 } = req.query;

    if (!user1 || !user2) {
        return res.status(400).json({ success: false, message: "Missing user parameters" });
    }

    const query = `
        SELECT MAX(timestamp) AS last_message_time
        FROM (
            SELECT timestamp FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
            UNION
            SELECT timestamp FROM media_files WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)
        ) AS combined_messages;
    `;

    db.query(query, [user1, user2, user2, user1, user1, user2, user2, user1], (err, results) => {
        if (err) {
            console.error("❌ Error fetching last message timestamp:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        const lastMessageTime = results[0]?.last_message_time ? new Date(results[0].last_message_time).getTime() : 0;
        res.json({ success: true, timestamp: lastMessageTime });
    });
});

// ✅ Create Upload Directory
const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Handle Text Messages & Store in MySQL
io.on("connection", (socket) => {
    socket.on("sendMessage", ({ sender, receiver, message }) => {
        console.log(`📩 Message from ${sender} to ${receiver}: ${message}`);
        const checkQuery = "SELECT COUNT(*) as count FROM messages WHERE sender = ? AND receiver = ? AND message = ? AND timestamp > NOW() - INTERVAL 1 SECOND";
        db.query(checkQuery, [sender, receiver, message], (err, results) => {
            if (err) return console.error(err);
            if (results[0].count > 0) return;

            const query = "INSERT INTO messages (sender, receiver, message, is_read) VALUES (?, ?, ?, 0)";
            db.query(query, [sender, receiver, message], (err) => {
                if (err) return console.error("Message save error:", err);

                io.to(receiver).emit("receiveMessage", { sender, receiver, message, is_read: 0 });
                io.to(sender).emit("receiveMessage", { sender, receiver, message, is_read: 1 });
            });
        });
    });



    // ✅ Handle media messages
    io.on("connection", (socket) => {
        socket.on("sendMedia", ({ sender, receiver, fileUrl, fileType, fileName }) => {
            console.log(`📸 Media from ${sender} to ${receiver}: ${fileUrl}, type: ${fileType}`);
    
            const checkQuery = "SELECT COUNT(*) as count FROM media_files WHERE sender = ? AND receiver = ? AND file_url = ? AND timestamp > NOW() - INTERVAL 1 SECOND";
            db.query(checkQuery, [sender, receiver, fileUrl], (err, results) => {
                if (err) return console.error("Check error:", err);
                if (results[0].count > 0) {
                    console.log("Duplicate media skipped");
                    return;
                }
    
                if (fileType.length > 50) {
                    console.warn(`File type too long, truncating: ${fileType}`);
                    fileType = fileType.substring(0, 50);
                }
    
                const query = "INSERT INTO media_files (sender, receiver, file_url, file_type, is_read) VALUES (?, ?, ?, ?, 0)";
                db.query(query, [sender, receiver, fileUrl, fileType], (err) => {
                    if (err) console.error("❌ MySQL Insert Error:", err);
    
                    socket.to(receiver).emit("receiveMedia", { sender, receiver, fileUrl, fileType, fileName, is_read: 0 });
                    socket.to(sender).emit("receiveMedia", { sender, receiver, fileUrl, fileType, fileName, is_read: 1 });
                });
            });
        });
    });
    socket.on("disconnect", () => {
        console.log("User disconnected.");
    });
});


// ✅ Handle Media Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});
const upload = multer({ storage });

app.post("/upload-media", upload.single("file"), (req, res) => {
    console.log("Received upload request:", req.body, req.file);
    if (!req.file) return res.json({ success: false, message: "No file uploaded." });

    const sender = req.body.sender;
    const receiver = req.body.receiver;
    if (!sender || !receiver) {
        console.log("Missing sender or receiver:", { sender, receiver });
        return res.json({ success: false, message: "Sender or receiver missing." });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const mimeType = req.file.mimetype;
    let fileType = mimeType.startsWith("image") ? "image" :
                   mimeType.startsWith("video") ? "video" :
                   mimeType.startsWith("audio") ? "audio" :
                   mimeType === "application/pdf" ? "pdf" :
                   mimeType === "text/plain" ? "text" : "file";

    const query = "INSERT INTO media_files (sender, receiver, file_url, file_type, is_read, timestamp) VALUES (?, ?, ?, ?, 0, NOW())";
    db.query(query, [sender, receiver, fileUrl, fileType], (err) => {
        if (err) {
            console.error("❌ MySQL Insert Error:", err);
            return res.json({ success: false, message: `Database error: ${err.message}` });
        }
        console.log("Media uploaded successfully:", fileUrl);
        res.json({ success: true, fileUrl });
    });
});

// ✅ Upload Image and Save to Diary
app.post("/upload-diary-image", upload.single("image"), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const imagePath = `/uploads/${req.file.filename}`; // ✅ Path to the image
    res.json({ success: true, imageUrl: imagePath });
});

// ✅ Save or Update a Diary Entry
app.post("/save-diary", (req, res) => {
    const { user, page_number, image_url, text_content } = req.body;

    const query = `
        INSERT INTO diary_entries (user, page_number, image_url, text_content)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE image_url = ?, text_content = ?;
    `;

    db.query(query, [user, page_number, image_url, text_content, image_url, text_content], (err) => {
        if (err) {
            console.error("Error saving diary entry:", err);
            return res.status(500).json({ success: false, error: err });
        }
        res.json({ success: true, message: "Diary entry saved!" });
    });
});

// ✅ Retrieve Diary Entries
// ✅ Fetch User’s Diary Entries
app.get("/get-diary", (req, res) => {
    const { user } = req.query;

    const query = "SELECT * FROM diary_entries WHERE user = ? ORDER BY page_number";

    db.query(query, [user], (err, results) => {
        if (err) {
            console.error("Error fetching diary entries:", err);
            return res.status(500).json({ success: false, error: err });
        }
        res.json({ success: true, entries: results });
    });
});

// ✅ Fetch Chat History from MySQL (Messages + Media)
app.get("/get-messages", (req, res) => {
    const { user1, user2 } = req.query;

    const query = `
        SELECT id, sender, receiver, message AS content, 'text' AS type, timestamp 
        FROM messages 
        WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
        AND (deleted_by_users IS NULL OR NOT FIND_IN_SET(?, deleted_by_users))
        UNION 
        SELECT id, sender, receiver, file_url AS content, file_type AS type, timestamp 
        FROM media_files 
        WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))
        AND (deleted_by_users IS NULL OR NOT FIND_IN_SET(?, deleted_by_users))
        ORDER BY timestamp;
    `;

    db.query(query, [user1, user2, user2, user1, user1, user1, user2, user2, user1, user1], (err, results) => {
        if (err) {
            console.error("❌ MySQL Fetch Error:", err);
            res.json({ success: false, error: err.message });
            return;
        }
        res.json({ success: true, messages: results });
    });
});
// ✅ Delete a Diary Page from MySQL
// ✅ Delete a Diary Page and Reorder Pages
app.post("/delete-diary-page", (req, res) => {
    const { user, page_number } = req.body;

    // 1️⃣ Delete the page
    const deleteQuery = "DELETE FROM diary_entries WHERE user = ? AND page_number = ?";
    
    db.query(deleteQuery, [user, page_number], (err, result) => {
        if (err) {
            console.error("❌ Error deleting diary page:", err);
            return res.status(500).json({ success: false, error: "Database error" });
        }

        if (result.affectedRows > 0) {
            console.log(`✅ Deleted page ${page_number} for user ${user}`);

            // 2️⃣ Reorder pages (shift numbers down)
            const updateQuery = `
                UPDATE diary_entries
                SET page_number = page_number - 1
                WHERE user = ? AND page_number > ?`;
            
            db.query(updateQuery, [user, page_number], (err, result) => {
                if (err) {
                    console.error("❌ Error reordering pages:", err);
                    return res.status(500).json({ success: false, error: "Error reordering pages" });
                }

                console.log("✅ Pages reordered successfully!");
                res.json({ success: true, message: "Diary page deleted and reordered!" });
            });

        } else {
            res.status(404).json({ success: false, error: "Page not found" });
        }
    });
});


// Get Messages Between Two Users
app.get("/messages", (req, res) => {
    const { sender, receiver } = req.query;

    db.query("SELECT * FROM messages WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?) ORDER BY timestamp", 
        [sender, receiver, receiver, sender], (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "Database error" });

            res.json({ success: true, messages: results });
    });
});


const blockedUsers = {};


app.post("/block-user", (req, res) => {
    const { user, blockedBy } = req.body;

    if (!blockedUsers[blockedBy]) {
        blockedUsers[blockedBy] = [];
    }

    blockedUsers[blockedBy].push(user);
    res.json({ success: true, message: `${user} has been blocked.` });
});




// Multer Storage for Profile Pictures & Chat Images

// ✅ Search for a User by Username
// ✅ Search for a User by Username or Email
// ✅ Search for a User by Username or Email
app.get("/search-user", (req, res) => {
    const searchQuery = req.query.query;

    if (!searchQuery) {
        return res.status(400).json({ success: false, message: "Search query required" });
    }

    // Use LIKE for partial, case-insensitive matching
    const sql = `
        SELECT username, email, profile_pic 
        FROM users 
        WHERE username LIKE ? OR email LIKE ? 
        ORDER BY username ASC
    `;
    const searchPattern = `%${searchQuery}%`;

    db.query(sql, [searchPattern, searchPattern], (err, results) => {
        if (err) {
            console.error("❌ MySQL Error:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (results.length === 0) {
            return res.json({ success: false, message: "No users found" });
        }

        console.log("Search results:", results); // Debug log
        res.json({ success: true, users: results });
    });
});
// ✅ Update User Profile
app.post("/update-profile", (req, res) => {
    const { username, age, gender } = req.body;

    if (!username || !age || !gender) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    const query = "UPDATE users SET age = ?, gender = ? WHERE username = ?";

    db.query(query, [age, gender, username], (err, result) => {
        if (err) {
            console.error("❌ Database error updating profile:", err);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        if (result.affectedRows === 0) {
            return res.json({ success: false, message: "User not found." });
        }

        res.json({ success: true, message: "Profile updated successfully!" });
    });
});


app.post('/send-message', (req, res) => {
    const { sender, receiver, message } = req.body;

    if (!sender || !receiver || !message) {
        return res.status(400).json({ success: false, message: "Sender, receiver, and message are required." });
    }

    // Ensure the chat list is updated when a new message is sent
    db.query("INSERT INTO chatlist (user, chat_with) VALUES (?, ?) ON DUPLICATE KEY UPDATE chat_with = chat_with", 
        [sender, receiver], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Error updating chat list." });
        }
    );

    // Save message
    db.query("INSERT INTO messages (sender, receiver, message, status) VALUES (?, ?, ?, 'unread')", 
        [sender, receiver, message], (msgErr) => {
            if (msgErr) return res.status(500).json({ success: false, message: "Error sending message." });

            // Notify receiver in real-time
            io.to(receiver).emit('newMessage', { sender, message });

            res.json({ success: true, message: "Message sent!" });
        }
    );
});


app.post("/delete-chat", (req, res) => {
    const { user, loggedInUser } = req.body;

    if (!user || !loggedInUser) {
        return res.status(400).json({ success: false, message: "Invalid data received" });
    }

    console.log(`🗑 Deleting chat between ${loggedInUser} and ${user}`);

    const sql = "DELETE FROM chat_list WHERE (user = ? AND chat_with = ?) OR (user = ? AND chat_with = ?)";
    db.query(sql, [loggedInUser, user, user, loggedInUser], (err, result) => {
        if (err) {
            console.error("❌ Database error while deleting chat:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }
        
        console.log(`✅ Deleted ${result.affectedRows} chat(s) between ${loggedInUser} and ${user}`);
        res.json({ success: true });
    });
});
app.delete("/clear-chat", (req, res) => {
    const { user, chatWith } = req.query;

    if (!user || !chatWith) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    // Update text messages to mark them as deleted for this user using deleted_by_users
    const queryMessages = `
        UPDATE messages 
        SET deleted_by_users = 
            CASE 
                WHEN deleted_by_users IS NULL THEN ? 
                WHEN NOT FIND_IN_SET(?, deleted_by_users) THEN CONCAT(deleted_by_users, ',', ?) 
                ELSE deleted_by_users 
            END
        WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?);
    `;

    // Update media files to mark them as deleted for this user using deleted_by_users
    const queryMedia = `
        UPDATE media_files 
        SET deleted_by_users = 
            CASE 
                WHEN deleted_by_users IS NULL THEN ? 
                WHEN NOT FIND_IN_SET(?, deleted_by_users) THEN CONCAT(deleted_by_users, ',', ?) 
                ELSE deleted_by_users 
            END
        WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?);
    `;

    db.query(queryMessages, [user, user, user, user, chatWith, chatWith, user], (err, result) => {
        if (err) {
            console.error("❌ Error clearing text messages for user:", err);
            return res.status(500).json({ success: false, error: err.message });
        }
        console.log(`Cleared text messages for ${user} with ${chatWith}: affectedRows=${result.affectedRows}`);

        db.query(queryMedia, [user, user, user, user, chatWith, chatWith, user], (err, result) => {
            if (err) {
                console.error("❌ Error clearing media files for user:", err);
                return res.status(500).json({ success: false, error: err.message });
            }
            console.log(`Cleared media files for ${user} with ${chatWith}: affectedRows=${result.affectedRows}`);

            res.json({ success: true, message: "Chat cleared for you!" });
        });
    });
});



// Store user socket IDs by username
const userSockets = {};

io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    socket.on("registerUser", ({ username }) => {
        if (username) {
            userSockets[username] = socket.id;
            console.log(`User ${username} registered with socket ID: ${socket.id}`);
            console.log("Current userSockets:", userSockets);
        }
    });

    socket.on("callUser", ({ sender, receiver, offer, isVideo }) => {
        const receiverSocketId = userSockets[receiver];
        console.log(`Call attempt from ${sender} to ${receiver}, Video: ${isVideo}`);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("incomingCall", { sender, offer, isVideo });
        } else {
            socket.emit("callFailed", { message: `${receiver} is not available` });
        }
    });

    socket.on("acceptCall", ({ sender, receiver, answer }) => {
        const senderSocketId = userSockets[sender];
        if (senderSocketId) {
            io.to(senderSocketId).emit("callAccepted", { receiver, answer });
        }
    });

    socket.on("sendICE", ({ candidate, receiver }) => {
        const receiverSocketId = userSockets[receiver];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("receiveICE", { candidate });
        }
    });

    socket.on("rejectCall", ({ sender }) => {
        const senderSocketId = userSockets[sender];
        if (senderSocketId) {
            io.to(senderSocketId).emit("callRejected");
        }
    });

    socket.on("endCall", ({ receiver }) => {
        const receiverSocketId = userSockets[receiver];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("callEnded"); // For an ongoing call
        }
    });

    socket.on("callCancelled", ({ receiver }) => {
        const receiverSocketId = userSockets[receiver];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("callCancelled"); // For pre-acceptance cancellation
            console.log(`Call from ${socket.id} to ${receiver} cancelled before acceptance`);
        }
    });

    socket.on("disconnect", () => {
        const disconnectedUser = Object.keys(userSockets).find(user => userSockets[user] === socket.id);
        if (disconnectedUser) {
            delete userSockets[disconnectedUser];
            console.log(`User ${disconnectedUser} disconnected: ${socket.id}`);
        }
    });
});
app.post('/accept-chat', (req, res) => {
    const { sender, receiver } = req.body;

    db.query("UPDATE chat_requests SET status = 'accepted' WHERE sender = ? AND receiver = ?", 
        [sender, receiver], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Database error." });
            res.json({ success: true, message: "Chat request accepted!" });
        });
});


app.post('/block-chat', (req, res) => {
    const { sender, receiver } = req.body;

    db.query("UPDATE chat_requests SET status = 'blocked' WHERE sender = ? AND receiver = ?", 
        [sender, receiver], (err) => {
            if (err) return res.status(500).json({ success: false, message: "Database error." });
            res.json({ success: true, message: "User has been blocked." });
        });
});



app.post('/unblock-user', (req, res) => {
    const { blocker, blocked } = req.body;

    db.query("DELETE FROM blocked_users WHERE blocker = ? AND blocked = ?", [blocker, blocked], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Database error." });
        res.json({ success: true, message: "User unblocked successfully!" });
    });
});




app.post('/post-quote', (req, res) => {
    const { username, content } = req.body;

    if (!username || !content) {
        return res.status(400).json({ success: false, message: "Username and content required." });
    }

    db.query("INSERT INTO quotes (username, content) VALUES (?, ?)", [username, content], (err) => {
        if (err) return res.status(500).json(err);
        res.json({ success: true, message: "Quote posted!" });
    });
});

app.get('/get-quotes', (req, res) => {
    db.query("SELECT * FROM quotes ORDER BY created_at DESC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});


// Update Message Status (Seen)  
app.post('/message-seen', (req, res) => {
    const { messageId } = req.body;
    db.query('UPDATE messages SET status = ? WHERE id = ?', ['seen', messageId], (err) => {
        if (err) return res.status(500).json(err);
        io.emit('messageSeen', { messageId });
        res.json({ message: 'Message marked as seen!' });
    });
});

// Typing Indicator


// Forgot Password (Email Sending)

//register

app.post("/register", (req, res) => {
    console.log("🔍 Received Registration Data:", req.body);

    const { username, email, password, age, gender } = req.body;

    if (!username || !email || !password || isNaN(age) || !gender) {
        return res.status(400).json({ success: false, message: "All fields are required!" });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error("❌ MySQL Query Error:", err);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        if (results.length > 0) {
            return res.status(400).json({ success: false, message: "User already registered." });
        }

        // Hash the password before storing
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                console.error("❌ Bcrypt Hashing Error:", err);
                return res.status(500).json({ success: false, message: "Error hashing password." });
            }

            // Store user in MySQL with hashed password
            db.query("INSERT INTO users (username, email, password, age, gender, verified) VALUES (?, ?, ?, ?, ?, ?)",
                [username, email, hashedPassword, age, gender, true], (insertErr) => {
                    if (insertErr) {
                        console.error("❌ MySQL Insert Error:", insertErr);
                        return res.status(500).json({ success: false, message: "Database error while saving user." });
                    }

                    res.json({ success: true, message: "User registered successfully!" });
                });
            });});
    // Delete existing unverified entry
    db.query("DELETE FROM verification WHERE email = ?", [email], (deleteErr) => {
        if (deleteErr) {
            console.error("❌ MySQL Delete Error:", deleteErr);
            return res.status(500).json({ success: false, message: "Database error while deleting old entry." });
        }

        // Generate a new verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`✅ New Code for ${email}: ${verificationCode}`);

        // Save new verification entry
        db.query("INSERT INTO verification (email, username, password, age, gender, code) VALUES (?, ?, ?, ?, ?, ?)",
            [email, username, password, age, gender, verificationCode], (err) => {
                if (err) {
                    console.error("❌ MySQL Insert Error:", err);
                    return res.status(500).json({ success: false, message: "Database error while inserting new entry." });
                }

                console.log("✅ New Verification Code Stored:", verificationCode);

                // Send new email with verification code
                transporter.sendMail({
                    from: "paliwalkhushal27@gmail.com",
                    to: email,
                    subject: "Verify Your Chat App Account",
                    text: `Your new verification code is: ${verificationCode}`
                }, (error, info) => {
                    if (error) {
                        console.error("❌ Email Sending Error:", error);
                        return res.status(500).json({ success: false, message: "Failed to send verification email." });
                    }
                    console.log("✅ Email Sent:", info.response);
                    res.json({ success: true, message: "New verification code sent to email." });
                });
            });
    });
});


    

    



// Email Verification Endpoint
app.post("/verify-email", (req, res) => {
    console.log("🔍 Received verification request:", req.body);

    const { email, verificationCode } = req.body;

    if (!email || !verificationCode) {
        return res.status(400).json({ success: false, message: "Email and verification code are required." });
    }

    // Check if the email is already verified in `users`
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, existingUser) => {
        if (err) {
            console.error("❌ MySQL Query Error (Check Users Table):", err);
            return res.status(500).json({ success: false, message: "Database error while checking existing user." });
        }

        if (existingUser.length > 0) {
            return res.json({ success: true, message: "Email already verified. You can log in." });
        }

        // Fetch stored verification code
        db.query("SELECT * FROM verification WHERE email = ?", [email], (err, results) => {
            if (err) {
                console.error("❌ MySQL Query Error:", err);
                return res.status(500).json({ success: false, message: "Database error." });
            }

            if (results.length === 0) {
                return res.status(400).json({ success: false, message: "No verification code found for this email." });
            }

            const storedCode = results[0].code;
            console.log(`🔍 Stored Code: ${storedCode}, Entered Code: ${verificationCode}`);

            if (storedCode !== verificationCode) {
                return res.status(400).json({ success: false, message: "Invalid verification code." });
            }

            // Insert into `users` table after successful verification
            const { username, password, age, gender } = results[0];

            db.query("INSERT INTO users (username, email, password, age, gender, verified) VALUES (?, ?, ?, ?, ?, ?)",
                [username, email, password, age, gender, true], (insertErr) => {
                    if (insertErr) {
                        console.error("❌ MySQL Insert Error:", insertErr);
                        return res.status(500).json({ success: false, message: "Database error while saving user." });
                    }

                    // Remove from verification table after successful registration
                    db.query("DELETE FROM verification WHERE email = ?", [email]);

                    res.json({ success: true, message: "Email verified successfully! You can now log in." });
                });
        });
    });
});


// Resend Verification Code
app.post("/resend-verification", (req, res) => {
    const { email } = req.body;
    if (!users[email]) return res.status(400).json({ success: false, message: "User not found." });
    
    const newCode = crypto.randomInt(100000, 999999).toString();
    verificationCodes[email] = newCode;
    
    transporter.sendMail({
        from: "paliwalkhushal27@gmail.com",
        to: email,
        subject: "New Verification Code",
        text: `Your new verification code is: ${newCode}`
    });
    
    res.json({ success: true, message: "New verification code sent." });
});

// Login Endpoint

app.post("/login", (req, res) => {
    console.log("🔍 Received Login Request:", req.body);

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required." });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error("❌ MySQL Query Error:", err);
            return res.status(500).json({ success: false, message: "Database error while checking user." });
        }

        if (results.length === 0) {
            return res.status(400).json({ success: false, message: "User not found. Please register first." });
        }

        const user = results[0];

        console.log(`🔍 Entered Password: ${password}, Stored Hashed Password: ${user.password}`);

        // Compare entered password with hashed password
        bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
                console.error("❌ Bcrypt Error:", err);
                return res.status(500).json({ success: false, message: "Error checking password." });
            }

            if (!isMatch) {
                return res.status(400).json({ success: false, message: "Incorrect password." });
            }

            console.log("✅ Login Successful:", user.email);

            res.json({ success: true, message: "Login successful!", user });
        });
    });
});


app.post("/forgot-password", (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required." });
    }

    // Check if email exists in `users`
    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) {
            console.error("❌ MySQL Query Error:", err);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        if (results.length === 0) {
            return res.status(400).json({ success: false, message: "User not found." });
        }

        // Generate reset code
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        console.log(`✅ Reset Code for ${email}: ${resetCode}`);

        // Save the reset code
        db.query("UPDATE users SET reset_code = ? WHERE email = ?", [resetCode, email]);

        // Send reset code via email
        transporter.sendMail({
            from: "paliwalkhushal27@gmail.com",
            to: email,
            subject: "Password Reset Code",
            text: `Your password reset code is: ${resetCode}`
        }, (error, info) => {
            if (error) {
                console.error("❌ Email Sending Error:", error);
                return res.status(500).json({ success: false, message: "Failed to send reset email." });
            }
            console.log("✅ Reset Email Sent:", info.response);
            res.json({ success: true, message: "Password reset code sent to your email." });
        });
    });
});

//reset password 

app.post("/reset-password", (req, res) => {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
        return res.status(400).json({ success: false, message: "All fields are required." });
    }

    // Check if reset code matches
    db.query("SELECT * FROM users WHERE email = ? AND reset_code = ?", [email, resetCode], (err, results) => {
        if (err) {
            console.error("❌ MySQL Query Error:", err);
            return res.status(500).json({ success: false, message: "Database error." });
        }

        if (results.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid reset code." });
        }

        // Hash the new password
        bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
            if (err) {
                console.error("❌ Bcrypt Hashing Error:", err);
                return res.status(500).json({ success: false, message: "Error hashing password." });
            }

            // Update the password in the database
            db.query("UPDATE users SET password = ?, reset_code = NULL WHERE email = ?", 
                [hashedPassword, email], (updateErr) => {
                    if (updateErr) {
                        console.error("❌ MySQL Update Error:", updateErr);
                        return res.status(500).json({ success: false, message: "Database error while updating password." });
                    }
                    res.json({ success: true, message: "Password reset successful!" });
                });
        });
    });
});

// Profile Update with Password Hashing
app.post("/update-profile", async (req, res) => {
    const { email, fullName, password } = req.body;
    if (!users[email]) return res.status(400).json({ success: false, message: "User not found." });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    users[email].fullName = fullName;
    users[email].profilePassword = hashedPassword;
    
    res.json({ success: true, message: "Profile updated successfully." });
});
// ✅ Fetch User Profile Data
app.get("/get-profile", (req, res) => {
    const username = req.query.user; // ✅ Get user from query parameter

    if (!username) {
        return res.status(400).json({ success: false, message: "Username required" });
    }

    const query = "SELECT username, email, age, gender, profile_pic FROM users WHERE username = ?";

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error("❌ Database error:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        res.json({ success: true, profile: results[0] });
    });
});


// ✅ Handle Profile Picture Upload
app.post("/upload-profile-pic", upload.single("profilePic"), (req, res) => {
    const username = req.body.username;

    if (!req.file || !username) {
        return res.status(400).json({ success: false, message: "Missing file or username" });
    }

    const imageUrl = `/uploads/${req.file.filename}`;

    const query = "UPDATE users SET profile_pic = ? WHERE username = ?";
    db.query(query, [imageUrl, username], (err, result) => {
        if (err) {
            console.error("❌ Database error updating profile picture:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        res.json({ success: true, imageUrl });
    });
});



// Login with Profile Password
app.post("/profile-login", async (req, res) => {
    const { email, password } = req.body;
    if (!users[email] || !users[email].profilePassword) return res.status(400).json({ success: false, message: "User not found or profile password not set." });
    
    const isMatch = await bcrypt.compare(password, users[email].profilePassword);
    if (!isMatch) return res.status(400).json({ success: false, message: "Incorrect password." });
    
    req.session.user = users[email];
    res.json({ success: true, message: "Profile login successful." });
});

server.listen(9000, () => {
    console.log('Server running on port 9000');
});


app.post('/save-chat-user', (req, res) => {
    const { loggedInUser, chatUser } = req.body;

    if (!loggedInUser || !chatUser) {
        return res.status(400).json({ success: false, message: "Invalid data received" });
    }

    const query = "INSERT INTO chatlist (user, chat_with) VALUES (?, ?) ON DUPLICATE KEY UPDATE chat_with = chat_with";
    db.query(query, [loggedInUser, chatUser], (err) => {
        if (err) {
            console.error("❌ Database error while saving chat user:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }
        res.json({ success: true });
    });
});

app.get("/get-user-profile-pic", (req, res) => {
    const username = req.query.user;

    if (!username) {
        return res.status(400).json({ success: false, message: "Username required" });
    }

    const query = "SELECT profile_pic FROM users WHERE username = ?";
    db.query(query, [username], (err, results) => {
        if (err) {
            console.error("❌ Error fetching profile pic:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (results.length > 0 && results[0].profile_pic) {
            res.json({ success: true, profilePic: results[0].profile_pic });
        } else {
            res.json({ success: true, profilePic: "default-profile.png" }); // Default pic if none exists
        }
    });
});



app.post('/delete-chat-user', (req, res) => {
    const { loggedInUser, chatUser } = req.body;

    if (!loggedInUser || !chatUser) {
        return res.status(400).json({ success: false, message: "Invalid data received" });
    }

    const query = "DELETE FROM chatlist WHERE user = ? AND chat_with = ?";
    db.query(query, [loggedInUser, chatUser], (err, result) => {
        if (err) {
            console.error("❌ Error deleting chat user:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (result.affectedRows === 0) {
            return res.json({ success: false, message: "User not found in chat list" });
        }

        res.json({ success: true });
    });
});
app.get("/get-comments", (req, res) => {
    const { diaryPageId } = req.query;

    if (!diaryPageId) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const query = "SELECT id, username, text, timestamp FROM comments WHERE diary_page_id = ? ORDER BY timestamp ASC";

    db.query(query, [diaryPageId], (err, result) => {
        if (err) {
            console.error("❌ Error fetching comments:", err);
            return res.status(500).json({ success: false });
        }

        res.json({ success: true, comments: result });
    });
});
app.post("/delete-comment", (req, res) => {
    const { commentId, username } = req.body;

    if (!commentId || !username) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const query = "DELETE FROM comments WHERE id = ? AND username = ?";

    db.query(query, [commentId, username], (err, result) => {
        if (err) {
            console.error("❌ Error deleting comment:", err);
            return res.status(500).json({ success: false });
        }

        if (result.affectedRows === 0) {
            return res.status(403).json({ success: false, message: "Unauthorized or comment not found" });
        }

        res.json({ success: true });
    });
});


app.post("/post-comment", (req, res) => {
    const { diaryPageId, username, text } = req.body;

    if (!diaryPageId || !username || !text) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const query = "INSERT INTO comments (diary_page_id, username, text, timestamp) VALUES (?, ?, ?, NOW())";

    db.query(query, [diaryPageId, username, text], (err) => {
        if (err) {
            console.error("❌ Error posting comment:", err);
            return res.status(500).json({ success: false });
        }
        res.json({ success: true });
    });
});
app.get("/get-diary-owner", (req, res) => {
    const { diaryPageId } = req.query;

    if (!diaryPageId) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const query = "SELECT user FROM diary_entries WHERE id = ?";

    db.query(query, [diaryPageId], (err, result) => {
        if (err) {
            console.error("❌ Error fetching diary owner:", err);
            return res.status(500).json({ success: false });
        }

        if (result.length > 0) {
            res.json({ success: true, owner: result[0].user });
        } else {
            res.json({ success: false, message: "Diary owner not found" });
        }
    });
});

app.get("/get-unread-comments", (req, res) => {
    const { user } = req.query;

    if (!user) return res.status(400).json({ success: false, message: "Invalid request" });

    // ✅ Fetch unread comments only if the requesting user is the diary owner
    const query = `
        SELECT COUNT(*) AS unreadCount 
        FROM comments 
        JOIN diary_entries ON comments.diary_page_id = diary_entries.id
        WHERE diary_entries.user = ? AND comments.is_read = 0;
    `;

    db.query(query, [user], (err, result) => {
        if (err) {
            console.error("❌ Error fetching unread comments:", err);
            return res.status(500).json({ success: false });
        }

        res.json({ success: true, unreadCount: result[0].unreadCount || 0 });
    });
});


app.post("/mark-comments-read", (req, res) => {
    const { diaryPageId, user } = req.body;

    if (!diaryPageId || !user) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    // ✅ Ensure only the diary owner can mark comments as read
    const query = `
        UPDATE comments 
        SET is_read = 1 
        WHERE diary_page_id = ? 
        AND EXISTS (SELECT 1 FROM diary_entries WHERE id = ? AND user = ?);
    `;

    db.query(query, [diaryPageId, diaryPageId, user], (err, result) => {
        if (err) {
            console.error("❌ Error marking comments as read:", err);
            return res.status(500).json({ success: false });
        }

        res.json({ success: true });
    });
});
app.get("/get-follow-stats", (req, res) => {
    const { user } = req.query;
    if (!user) return res.status(400).json({ success: false, message: "User parameter required" });

    const followersQuery = "SELECT COUNT(*) AS followers FROM followers WHERE following = ?";
    const followingQuery = "SELECT COUNT(*) AS following FROM followers WHERE follower = ?";
    const newFollowersQuery = "SELECT COUNT(*) AS newFollowers FROM followers WHERE following = ? AND seen = 0";

    db.query(followersQuery, [user], (err, followersResult) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });

        db.query(followingQuery, [user], (err, followingResult) => {
            if (err) return res.status(500).json({ success: false, message: "Database error" });

            db.query(newFollowersQuery, [user], (err, newFollowersResult) => {
                if (err) return res.status(500).json({ success: false, message: "Database error" });

                res.json({
                    success: true,
                    followers: followersResult[0].followers,
                    following: followingResult[0].following,
                    newFollowerCount: newFollowersResult[0].newFollowers
                });
            });
        });
    });
});


app.get("/check-follow", (req, res) => {
    const { user, target } = req.query;

    if (!user || !target) return res.status(400).json({ success: false, message: "Invalid request" });

    const query = "SELECT COUNT(*) AS count FROM followers WHERE follower = ? AND following = ?";

    db.query(query, [user, target], (err, result) => {
        if (err) {
            console.error("❌ Error checking follow status:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        res.json({ success: true, isFollowing: result[0].count > 0 });
    });
});

app.post("/toggle-follow", (req, res) => {
    const { user, target, action } = req.body;

    if (!user || !target || !["follow", "unfollow"].includes(action)) {
        return res.status(400).json({ success: false, message: "Invalid request data" });
    }

    if (action === "follow") {
        const query = `
            INSERT INTO followers (follower, following, seen) 
            VALUES (?, ?, 0) 
            ON DUPLICATE KEY UPDATE seen = 0;`;

        db.query(query, [user, target], (err, result) => {
            if (err) {
                console.error("❌ Error following user:", err);
                return res.status(500).json({ success: false, message: "Database error when following user" });
            }
            console.log(`✅ ${user} followed ${target}`);
            res.json({ success: true });
        });

    } else {
        const query = "DELETE FROM followers WHERE follower = ? AND following = ?";

        db.query(query, [user, target], (err, result) => {
            if (err) {
                console.error("❌ Error unfollowing user:", err);
                return res.status(500).json({ success: false, message: "Database error when unfollowing user" });
            }
            console.log(`✅ ${user} unfollowed ${target}`);
            res.json({ success: true });
        });
    }
});


app.get("/get-follow-list", (req, res) => {
    const { user, type } = req.query;
    if (!user || !["followers", "following"].includes(type)) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const query = type === "followers"
        ? "SELECT users.username, users.profile_pic FROM followers JOIN users ON followers.follower = users.username WHERE followers.following = ?"
        : "SELECT users.username, users.profile_pic FROM followers JOIN users ON followers.following = users.username WHERE followers.follower = ?";

    db.query(query, [user], (err, results) => {
        if (err) return res.status(500).json({ success: false, message: "Database error" });

        res.json({ success: true, users: results });
    });
});

app.post("/mark-followers-seen", (req, res) => {
    const { user } = req.body;
    if (!user) return res.status(400).json({ success: false, message: "Invalid request" });

    const query = "UPDATE followers SET seen = 1 WHERE following = ? AND seen = 0";
    db.query(query, [user], (err) => {
        if (err) {
            console.error("❌ Error updating seen followers:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }
        res.json({ success: true });
    });
});

// Add this endpoint if not already present
app.get("/get-unread-count", (req, res) => {
    const { user } = req.query;

    if (!user) {
        return res.status(400).json({ success: false, message: "User parameter required" });
    }

    const query = `
        SELECT sender, COUNT(*) as unreadCount
        FROM (
            SELECT sender FROM messages WHERE receiver = ? AND is_read = 0
            UNION ALL
            SELECT sender FROM media_files WHERE receiver = ? AND is_read = 0
        ) AS combined_unread
        GROUP BY sender
    `;
    db.query(query, [user, user], (err, results) => {
        if (err) {
            console.error("❌ Error fetching unread count:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        const unreadMap = {};
        results.forEach(row => {
            unreadMap[row.sender] = row.unreadCount;
            console.log(`Unread for ${row.sender}: ${row.unreadCount}`);
        });
        res.json({ success: true, unread: unreadMap });
    });
});




// Add endpoint to mark messages as read
app.post("/mark-messages-read", (req, res) => {
    const { user, chatWith } = req.body;

    if (!user || !chatWith) {
        return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const textQuery = "UPDATE messages SET is_read = 1 WHERE receiver = ? AND sender = ? AND is_read = 0";
    const mediaQuery = "UPDATE media_files SET is_read = 1 WHERE receiver = ? AND sender = ? AND is_read = 0";

    db.query(textQuery, [user, chatWith], (err, textResult) => {
        if (err) {
            console.error("❌ Error marking text messages as read:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        db.query(mediaQuery, [user, chatWith], (err, mediaResult) => {
            if (err) {
                console.error("❌ Error marking media as read:", err);
                return res.status(500).json({ success: false, message: "Database error" });
            }

            // Fetch the newly marked messages to send to the sender
            const fetchMarkedQuery = `
                SELECT id, timestamp 
                FROM messages 
                WHERE receiver = ? AND sender = ? AND is_read = 1
                UNION
                SELECT id, timestamp 
                FROM media_files 
                WHERE receiver = ? AND sender = ? AND is_read = 1
            `;
            db.query(fetchMarkedQuery, [user, chatWith, user, chatWith], (fetchErr, markedMessages) => {
                if (fetchErr) {
                    console.error("❌ Error fetching marked messages:", fetchErr);
                } else {
                    // Emit to sender (chatWith) with marked message details
                    io.to(chatWith).emit("messagesSeen", {
                        receiver: user,
                        sender: chatWith,
                        markedMessages: markedMessages.map(msg => ({
                            timestamp: msg.timestamp.toISOString()
                        }))
                    });
                }
            });

            res.json({ success: true, message: "Messages and media marked as read" });
            io.to(user).emit("messagesRead", { chatWith });
        });
    });
});

app.post("/delete-message", (req, res) => {
    const { sender, receiver, content, messageType, deleteForEveryone } = req.body;

    if (!sender || !receiver || !content || !messageType) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const table = messageType === "text" ? "messages" : "media_files";
    const contentField = messageType === "text" ? "message" : "file_url";

    // Check for messages where the user is either sender or receiver
    const checkQuery = `
        SELECT id, timestamp, deleted_by_users 
        FROM ${table} 
        WHERE ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)) 
        AND ${contentField} = ? 
        ORDER BY timestamp DESC 
        LIMIT 1`;
    db.query(checkQuery, [sender, receiver, receiver, sender, content], (checkErr, checkResults) => {
        if (checkErr) {
            console.error(`❌ Error checking ${messageType} existence:`, checkErr);
            return res.status(500).json({ success: false, message: `Database error: ${checkErr.message}` });
        }
        console.log("Check result:", checkResults);

        if (checkResults.length === 0) {
            return res.json({ success: false, message: "Message not found in database" });
        }

        const messageId = checkResults[0].id;
        const foundTimestamp = checkResults[0].timestamp;
        const currentDeletedUsers = checkResults[0].deleted_by_users || "";

        if (deleteForEveryone) {
            const query = `DELETE FROM ${table} WHERE id = ?`;
            db.query(query, [messageId], (err, result) => {
                if (err) {
                    console.error(`❌ Error deleting ${messageType} for everyone:`, err);
                    return res.status(500).json({ success: false, message: `Database error: ${err.message}` });
                }
                if (result.affectedRows > 0) {
                    res.json({ success: true, message: "Message deleted for everyone" });
                    io.to(receiver).emit("messageDeleted", { sender, receiver, content, messageType, timestamp: foundTimestamp, messageIds: [messageId] });
                    io.to(sender).emit("messageDeleted", { sender, receiver, content, messageType, timestamp: foundTimestamp, messageIds: [messageId] });
                } else {
                    res.json({ success: false, message: "Message not found during deletion" });
                }
            });
        } else {
            console.log(`Attempting to mark ${messageType} as deleted for ${sender}. Current deleted_by_users: ${currentDeletedUsers}`);
            const query = `
                UPDATE ${table}
                SET deleted_by_users = ?
                WHERE id = ?`;
            const newDeletedUsers = currentDeletedUsers ? `${currentDeletedUsers},${sender}` : sender;
            db.query(query, [newDeletedUsers, messageId], (err, result) => {
                if (err) {
                    console.error(`❌ Error marking ${messageType} as deleted for user:`, err);
                    return res.status(500).json({ success: false, message: `Database error: ${err.message}` });
                }
                console.log(`Update result: affectedRows=${result.affectedRows}`);
                if (result.affectedRows > 0) {
                    res.json({ success: true, message: "Message deleted for you" });
                } else {
                    res.json({ success: false, message: "Message not found during update or already deleted for you" });
                }
            });
        }
    });
});