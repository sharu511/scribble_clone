import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = {};

wss.on('connection', (ws, req) => {
    ws.send(JSON.stringify({ type: "user_connected", message: `Connected to ws` }));
    console.log("User Connected");

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'create':
                const roomId = generateRoomId();
                rooms[roomId] = { players: [], word: null, drawer: null, guesses: [], chat: [], scores: {}, drawerIndex: 0 };
                rooms[roomId].players.push(ws);
                ws.roomId = roomId;
                ws.isDrawer = true;
                ws.username = data.username;
                rooms[roomId].scores[ws.username] = 0;
                console.log(rooms);
                ws.send(JSON.stringify({ type: "roomCreated", roomId, message: "Room Created " + ws.username }));

                broadcast(roomId, { type: 'drawer', drawer: ws.username });
                break;

            case 'join':
                const room = rooms[data.roomId];
                console.log("Joining data", data);
                console.log(rooms);

                if (room) {
                    room.players.push(ws);
                    ws.roomId = data.roomId;
                    ws.isDrawer = false;
                    ws.username = data.username;
                    room.scores[ws.username] = 0;
                    broadcast(ws.roomId, { type: "user_joined", message: `${data.username} joined the room`, players: getPlayers(room) });
                    ws.send(JSON.stringify({ type: "joined", roomId: data.roomId, players: getPlayers(room) }));
                } else {
                    ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
                }
                break;

            case 'start_game':
                startGame(ws.roomId);
                break;

            case 'choose_word':
                chooseWord(ws.roomId, data.word);
                break;

            case 'draw':
                broadcast(ws.roomId, { type: 'draw', ...data });
                break;

            case 'guess':
                handleGuess(ws, data.message);
                break;

            case 'chat':
                handleChat(ws, data.message);
                break;

            case "leave":
                console.log(ws.username,"wants to leave the room");
                leaveRoom(ws);
                break;

            case "clear_canvas":
                broadcast(ws.roomId, { type: "clear_canvas" });
                break;

            case 'get_players':
                broadcastPlayerList(ws.roomId);
                break;

            default:
                ws.send(JSON.stringify({ type: "waiting for response" }));
        }
    });

    ws.on('close', () => {
        console.log("Closing the web socket");

        if (ws.roomId && rooms[ws.roomId]) {
            rooms[ws.roomId].players = rooms[ws.roomId].players.filter(client => client !== ws);
            if (rooms[ws.roomId].players.length === 0) {
                delete rooms[ws.roomId];
            }
        }
    });
});

function broadcast(roomId, message) {
    rooms[roomId].players.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function leaveRoom(ws) {
    for (const roomId in rooms) {
        console.log("Inside leave room with",roomId);
        
        const room = rooms[roomId];

        const index = room.players.indexOf(ws);
        if (index !== -1) {
            console.log("User found and removing from room",ws);
            room.players.splice(index, 1);
            delete room.scores[ws.username];
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                broadcast(roomId,{type:"notification",message:`${ws.username} left the room`})
                broadcastPlayerList(roomId);
            }
            break;
        }
    }
}

function getPlayers(room) {
    return room.players.map(player => player.username);
}

function broadcastPlayerList(roomId) {
    const room = rooms[roomId];
    const playerList = getPlayers(room);
    broadcast(roomId, { type: "player_list", players: playerList });
}

function startGame(roomId) {
    const room = rooms[roomId];
    if (room.players.length > 0) {
        room.drawer = room.players[room.drawerIndex];
        // Notify all players who the drawer is
        broadcast(roomId, { type: 'drawer', drawer: room.drawer.username });
        const words = ['cat', 'dog', 'tree'];
        room.drawer.send(JSON.stringify({ type: 'choose_word', words }));
    }
}

function chooseWord(roomId, word) {
    const room = rooms[roomId];
    room.word = word;
    broadcast(roomId, { type: 'startDrawing',wordCount:word.length,isStarted:true });
    startTimer(roomId);
}

function handleGuess(ws, message) {
    const room = rooms[ws.roomId];
    if (message === room.word) {
        const timeRemaining = room.timeRemaining;
        room.scores[ws.username] += timeRemaining;

        broadcast(ws.roomId, { type: 'correctGuess', user: ws.username  });
        ws.send(JSON.stringify({ type: "Congratulations", message: "Your guess was correct", points: room.scores[ws.username] }));
        room.word = null;
        // announceWinner(ws.roomId);
    } else {
        broadcast(ws.roomId, { type: 'chat', message:message,sender:ws.username });
    }
}

function handleChat(ws, message) {
    broadcast(ws.roomId, { type: 'chat', message: message, sender: ws.username });
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 9);
}

function startTimer(roomId) {
    const room = rooms[roomId];
    room.timeRemaining = 60;
    const timer = setInterval(() => {
        if (room.timeRemaining > 0) {
            room.timeRemaining--;
            broadcast(roomId, { type: 'timer', timeRemaining: room.timeRemaining });
        } else {
            clearInterval(timer);
            broadcast(roomId, { type: "timesUp" });
            announceWinner(roomId);
        }
    }, 1000);
}

function announceWinner(roomId) {
    const room = rooms[roomId];
    if (!room.word) {
        let maxScore = -1;
        let winner = null;

        for (const [username, score] of Object.entries(room.scores)) {
            if (score > maxScore) {
                maxScore = score;
                winner = username;
            }
        }
        broadcast(roomId, { type: "winner", user: winner, score: maxScore });


        room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
        const nextDrawer = room.players[room.drawerIndex];
        broadcast(roomId, { type: "next_drawer", newDrawer: nextDrawer.username });


        startGame(roomId);
    }
}


server.listen(8080, () => {
    console.log("Server started on port 8080");
});
