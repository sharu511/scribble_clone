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
                rooms[roomId] = {
                    players: [],
                    word: null,
                    drawer: null,
                    guesses: [],
                    chat: [],
                    scores: {}, // Initialize scores here
                    drawerIndex: 0,
                    correctGuess:false,
                    rounds:0
                };
                rooms[roomId].players.push(ws);
                ws.roomId = roomId;
                ws.isDrawer = true;
                ws.username = data.username;

                // Initialize player's score and rounds
                rooms[roomId].scores[ws.username] = { score: 0,hasPlayed:false};
                console.log(rooms);
                ws.send(JSON.stringify({ type: "roomCreated", roomId, message: "Room Created " + ws.username }));

                broadcast(roomId, { type: 'drawer', drawer: ws.username });
                break;

            case 'join':
                const room = rooms[data.roomId];
                if (room) {
                    room.players.push(ws);
                    ws.roomId = data.roomId;
                    ws.isDrawer = false;
                    ws.username = data.username;

                    // Initialize player's score and rounds if they don't exist
                    if (!room.scores[ws.username]) {
                        room.scores[ws.username] = { score: 0,hasPlayed:false};
                    }

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
    return room.players.map(player => ({
        username: player.username,
        score: room.scores[player.username].score,
    }));
}

function broadcastPlayerList(roomId) {
    const room = rooms[roomId];
    const playerList = getPlayers(room);
    const playersWithScores = playerList.map(player => ({
        username: player,
        score: room.scores[player].score,
    }));
    broadcast(roomId, { type: "playerList", players: playersWithScores });
}

function startGame(roomId) {
    const room = rooms[roomId];
    if (room.players.length > 0) {
        room.drawer = room.players[room.drawerIndex];
        // Notify all players who the drawer is
        broadcast(roomId, { type: 'drawer', drawer: room.drawer.username });
        const words = ['cat', 'dog', 'tree'];
        room.drawer.send(JSON.stringify({ type: 'choose_word', words }));
        
        // Initialize rounds for players if not already set
        
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
        room.scores[ws.username].score += timeRemaining;

        // Notify players about the correct guess
        broadcast(ws.roomId, { type: 'correctGuess', user: ws.username });
        ws.send(JSON.stringify({ type: "Congratulations", message: "Your guess was correct", points: room.scores[ws.username].score }));

        // Clear the word as it has been guessed
        room.word = null;

        // Set a flag to indicate a correct guess
        room.correctGuess = true;
    } else {
        broadcast(ws.roomId, { type: 'chat', message: message, sender: ws.username });
    }
}



function checkAllPlayersPlayed(room) {
    // Assuming each player has played once in this round
    console.log("Checking all Players");

    
    return room.players.every(player => {
        console.log(room.scores[player.username]);
        
        return room.scores[player.username].hasPlayed; // You need to track this property
    });
}

function checkAllCompletedRounds(room) {
    const allCompleted = Object.values(room.scores).every(score => {
        console.log(score); // Log the current score object
        return score.rounds >= 2; // Ensure to return the condition
    });

    console.log(allCompleted); // Log the result
    console.log(room.scores);   // Log the scores object
    return allCompleted;        // Return the final result
}


function handleChat(ws, message) {
    broadcast(ws.roomId, { type: 'chat', message: message, sender: ws.username });
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 9);
}
function startTimer(roomId) {
    const room = rooms[roomId];
    room.timeRemaining = 60; // Set time for the round
    const timer = setInterval(() => {
        if (room.timeRemaining > 0) {
            room.timeRemaining--;
            broadcast(roomId, { type: 'timer', timeRemaining: room.timeRemaining });
        } else {
            clearInterval(timer);
            broadcast(roomId, { type: "timesUp" });

            // Check if a word was guessed correctly before time runs out
            if (room.correctGuess) {
                room.correctGuess = false; // Reset flag for the next round
            } else {
                broadcast(roomId, { type: 'noGuess', message: "Time's up! No one guessed the word." });
            }

            // Check if all players have played in this round
            if (checkAllPlayersPlayed(room)) {
                // Increment rounds for everyone
                room.rounds += 1;
                console.log("Round Updated");
                room.players.forEach(player => {
                    room.scores[player.username].hasPlayed = false; // Reset for new round
                });
                
                broadcast(roomId, { type: 'roundUpdate', rounds: room.rounds });

                // Check if all players have completed 2 rounds
            
            } 
            if (room.rounds>=2) {
                announceWinner(roomId);
            }else {
                announceNextRound(roomId);
            }
        }
    }, 1000);
}
function announceNextRound(roomId) {
    const room = rooms[roomId];
    const currentDrawer = room.players[room.drawerIndex];
    room.scores[currentDrawer.username].hasPlayed = true;
    
    // Proceed to the next drawer
    room.drawerIndex = (room.drawerIndex + 1) % room.players.length; // Move to the next player
    console.log("scores after player",currentDrawer.username,"completed",room.scores);
    
    startGame(roomId);
}
function announceWinner(roomId) {
    const room = rooms[roomId];
    let maxScore = -1;
    let winner = null;

    for (const [username, { score }] of Object.entries(room.scores)) {
        if (score > maxScore) {
            maxScore = score;
            winner = username;
        }
    }

    broadcast(roomId, { type: "winner", user: winner, score: maxScore });


    // Optionally reset room or leave it as is for further games
    // delete rooms[roomId]; // Uncomment to reset the room after the game ends
}


server.listen(8080, () => {
    console.log("Server started on port 8080");
});
