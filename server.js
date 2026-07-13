const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

let users = {}; 
let connections = []; 
let privateMessages = []; 

function getDayString() {
    return new Date().toISOString().slice(0, 10);
}

function clearExpiredUsers() {
    const today = getDayString();
    Object.keys(users).forEach(token => {
        if (users[token].day !== today) {
            delete users[token];
            connections = connections.filter(c => c.userA !== token && c.userB !== token);
            privateMessages = privateMessages.filter(m => m.sender !== token && m.receiver !== token);
        }
    });
}

function getTokenByName(name) {
    const today = getDayString();
    return Object.keys(users).find(token => users[token].username === name && users[token].day === today);
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/api/register', (req, res) => {
    const { token, chosenId } = req.body;
    if (!token || !chosenId || !/^\d{12}$/.test(chosenId)) {
        return res.status(400).json({ message: 'Ungültige ID-Formatierung.' });
    }

    clearExpiredUsers();

    const existingToken = getTokenByName(chosenId);
    if (existingToken && existingToken !== token) {
        return res.status(400).json({ message: 'Diese ID ist für heute bereits vergeben.' });
    }

    users[token] = {
        username: chosenId,
        day: getDayString()
    };

    res.json({ success: true });
});

app.get('/api/dashboard', (req, res) => {
    const { token } = req.query;
    if (!token || !users[token]) {
        return res.status(401).json({ error: 'Nicht registriert oder abgelaufen' });
    }

    clearExpiredUsers();
    const me = users[token];
    
    const validFriends = [];
    connections.forEach(c => {
        if (c.userA === token && c.confirmed) {
            const fInfo = users[c.userB];
            if (fInfo) validFriends.push(fInfo.username);
        } else if (c.userB === token && c.confirmed) {
            const fInfo = users[c.userA];
            if (fInfo) validFriends.push(fInfo.username);
        }
    });

    res.json({ username: me.username, friends: validFriends });
});

app.post('/api/friends/add', (req, res) => {
    const { token, friendName } = req.body;
    if (!token || !users[token] || !friendName) return res.status(400).json({ message: 'Anfrage unvollständig.' });

    const me = users[token];
    if (me.username === friendName) return res.status(400).json({ message: 'Du kannst dich nicht selbst hinzufügen.' });

    const targetToken = getTokenByName(friendName);
    if (!targetToken) return res.status(404).json({ message: 'ID im System aktuell nicht aktiv.' });

    const existing = connections.find(c => 
        (c.userA === token && c.userB === targetToken) || 
        (c.userA === targetToken && c.userB === token)
    );

    if (existing) {
        if (existing.userB === token && !existing.confirmed) {
            existing.confirmed = true;
            return res.json({ message: 'Erfolgreich gekoppelt! Ihr könnt jetzt chatten.' });
        }
        return res.json({ message: 'Kopplung ausstehend. Dein Partner muss deine ID eingeben.' });
    }

    connections.push({ userA: token, userB: targetToken, confirmed: false });
    res.json({ message: 'Anfrage gesendet! Dein Partner muss dich ebenfalls adden.' });
});

app.get('/api/messages', (req, res) => {
    const { token, friend } = req.query;
    if (!token || !users[token] || !friend) return res.status(400).json([]);

    const friendToken = getTokenByName(friend);
    if (!friendToken) return res.json([]);

    const chatHistory = privateMessages
        .filter(m => (m.sender === token && m.receiver === friendToken) || (m.sender === friendToken && m.receiver === token))
        .map(m => ({ text: m.text, fromMe: m.sender === token }));

    res.json(chatHistory);
});

app.post('/api/messages/send', (req, res) => {
    const { token, toFriend, text } = req.body;
    if (!token || !users[token] || !toFriend || !text) return res.status(400).json({ success: false });

    const friendToken = getTokenByName(toFriend);
    if (!friendToken) return res.status(404).json({ success: false });

    const isFriend = connections.some(c => 
        c.confirmed && ((c.userA === token && c.userB === friendToken) || (c.userA === friendToken && c.userB === token))
    );

    if (!isFriend) return res.status(403).json({ error: 'Nicht gekoppelt' });

    privateMessages.push({ sender: token, receiver: friendToken, text: text.trim() });
    res.json({ success: true });
});

app.listen(3000, () => console.log('Server läuft auf https://kizzyyyyyy.github.io')); 
