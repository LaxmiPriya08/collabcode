require('dotenv').config();  // Load environment variables
console.log("Loaded SECRET_KEY:", process.env.SECRET_KEY);
const cors = require('cors');
const mysql = require('mysql2');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const app = express();
const httpServer = new http.Server(app);
const axios = require("axios");

const CLIENT_URL = "http://localhost:3000";

// Middleware
app.use(
    cors({
        origin: CLIENT_URL,
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
        credentials: true,
    })
);

app.use(cookieParser());
app.use(express.json());

// MySQL Database Connection
const db = require('./db/db'); // Import MySQL connection

// Routes
app.use(require('./router/auth'));

const PORT = process.env.PORT || 5000;

var rooms = [];
var removeRooms = [];

const io = require("socket.io")(httpServer, {
    cors: {
        origin: CLIENT_URL,
        methods: ["GET", "POST"],
    },
});

function removingRooms() {
    console.log("ROOMS: " + rooms);
    if (removeRooms.length !== 0) {
        for (let i = 0; i < removeRooms.length; i++) {
            if (!io.sockets.adapter.rooms.get(removeRooms[i])) {
                rooms = rooms.filter((item) => item !== removeRooms[i]);
            }
        }
    }
    removeRooms = [];
    setTimeout(removingRooms, 60 * 60 * 1000);
}

function getLastValue(set) {
    let value;
    for (value of set);
    return value;
}

io.on("connection", (socket) => {
    console.log("CONNECTED SUCCESSFULLY");
    const { id } = socket.client;
    console.log(`User connected ${id}`);

    // Room existence check
    socket.on('room-id', (msg) => {
        let exists = rooms.includes(msg);
        socket.emit('room-check', exists);
    });

    // Broadcast code changes
    socket.on('code-change', (msg) => {
        socket.broadcast.to(socket.room).emit('code-update', msg);
    });

    // Send initial data to last joined user
    socket.on('user-join', (msg) => {
        let room = io.sockets.adapter.rooms.get(socket.room);
        let lastPerson = getLastValue(room);
        console.log("lastPerson-->" + lastPerson);
        io.to(lastPerson).emit('accept-info', msg);
    });

    // User joins room
    socket.on('join-room', (msg) => {
        console.log("JOINING " + msg.id);
        socket.room = msg.id;
        socket.join(msg.id);

        let room = io.sockets.adapter.rooms.get(socket.room);
        console.log(room);
        if (room.size > 1) {
            let it = room.values();
            let first = it.next().value;
            console.log("first-->" + first);
            io.to(first).emit('request-info', "");
        }
        socket.emit('receive-message', { sender: 'admin', text: `${msg.nameOfUser}, welcome to room.` });
        socket.broadcast.to(socket.room).emit('receive-message', { sender: 'admin', text: `${msg.nameOfUser} has joined!` });
        io.sockets.in(socket.room).emit('joined-users', room.size);
    });

    // Room creation
    socket.on('created-room', (msg) => {
        console.log("CREATED-ROOM " + msg);
        rooms.push(msg);
    });

    // Language change broadcast
    socket.on('language-change', (msg) => {
        io.sockets.in(socket.room).emit('language-update', msg);
    });

    // Title change broadcast
    socket.on('title-change', (msg) => {
        io.sockets.in(socket.room).emit('title-update', msg);
    });

    // Message broadcasting
    socket.on('sendMessage', ({ message, sender }) => {
        io.to(socket.room).emit('receive-message', { sender: sender, text: message });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User ${id} disconnected`);
    });

    socket.on('leaving', (msg) => {
        try {
            let room = io.sockets.adapter.rooms.get(socket.room);
            io.sockets.in(socket.room).emit('joined-users', room.size - 1);
            socket.broadcast.to(socket.room).emit('receive-message', { sender: 'admin', text: `${msg.nameOfUser} has left!` });
            if (room.size === 1) {
                console.log("Leaving Room " + socket.room);
                socket.leave(socket.room);
                removeRooms.push(socket.room);
            }
        } catch (error) {
            console.log("Leaving error");
        }
    });

    socket.on('disconnecting', () => {
        try {
            let room = io.sockets.adapter.rooms.get(socket.room);
            io.sockets.in(socket.room).emit('joined-users', room.size - 1);
            if (room.size === 1) {
                console.log("Leaving Room " + socket.room);
                socket.leave(socket.room);
                removeRooms.push(socket.room);
            }
        } catch (error) {
            console.log("Disconnect error");
        }
    });
});

// Route for testing server
app.get('/', (req, res) => {
    res.send(`Welcome`);
});

// JDoodle API execution route
app.post('/execute', async (req, res) => {
    console.log(req.body);
    const { script, language, stdin, versionIndex } = req.body;

    try {
        const response = await axios.post(process.env.JDOODLE_URL, {
            script,
            stdin,
            language,
            versionIndex,
            clientId: process.env.JDOODLE_CLIENT_ID,
            clientSecret: process.env.JDOODLE_CLIENT_SECRET
        });

        console.log("RESPONSE from jdoodle--->", response.data);
        res.json(response.data);
    } catch (error) {
        console.error("JDoodle API error:", error);
        res.status(500).json({ error: "JDoodle API request failed" });
    }
});

console.log('Hello world from server IndexJS');
removingRooms();
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
