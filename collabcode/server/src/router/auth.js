const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const util = require('util');
const authenticate = require('../middleware/authenticate');
const db = require('../db/db'); // Import MySQL connection

const query = util.promisify(db.query).bind(db); // To use async/await with MySQL

router.post('/register', async (req, res) => {
    console.log('Hello');
    console.log(req.body);
    const { userName, email, password } = req.body;

    if (!userName || !email || !password) {
        console.log('Please enter all fields');
        return res.status(422).json({ error: "Please fill all required fields" });
    }

    try {
        const userExists = await query("SELECT * FROM users WHERE email = ?", [email]);
        
        if (userExists.length > 0) {
            return res.status(422).json({ error: "User with the same email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await query("INSERT INTO users (userName, email, password) VALUES (?, ?, ?)", [userName, email, hashedPassword]);

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post('/login', async (req, res) => {
    const { userName, password } = req.body;

    if (!userName || !password) {
        return res.status(422).json({ error: "Please fill all required fields" });
    }

    try {
        const users = await query("SELECT * FROM users WHERE userName = ?", [userName]);

        if (users.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const user = users[0];
        console.log("Stored Password:", user.password); // Debug statement
        console.log("Entered Password:", password); // Debug statement
        
        const isMatch = await bcrypt.compare(password, user.password);
        console.log("Password Match Result:", isMatch); // Debug statement

        if (!isMatch) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign({ id: user.id }, process.env.SECRET_KEY, { expiresIn: "1h" });

        res.cookie("jwtToken", token, { 
            expires: new Date(Date.now() + 25892000000), 
            httpOnly: true 
        });

        res.json({ message: "Logged in successfully", token });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.get('/roomsforuser', authenticate, (req, res) => {
    console.log("Hello From Room");
    res.send(req.rootUser);
});

router.get('/logout', (req, res) => {
    console.log("Logging out");
    res.clearCookie('jwtToken', { path: '/' });
    res.status(200).send("Logged out successfully");
});

router.get('/inaroom', authenticate, (req, res) => {
    console.log("Hello From inside Room");
    res.send(req.rootUser);
});

router.get('/checkforUser', (req, res) => {
    console.log("Checking for Token -->");
    try {
        if (!req.cookies.jwtToken) {
            return res.status(200).json({ isuser: "0" });
        }
        res.status(200).json({ isuser: "1" });
    } catch (error) {
        res.status(200).json({ message: "Some error occurred" });
    }
});

module.exports = router;
