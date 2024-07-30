import WebSocket ,{ WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';


const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({server});

const rooms={};


wss.on('connection',(ws,req)=>{
    ws.send(JSON.stringify({type:"user_connected",message:`Connected to ws`}))
    console.log("User Connected");
    ws.on('message',(message)=>{
        const data = JSON.parse(message);

        switch(data.type){
            case 'create':
                const roomId = generateRoomId();
                rooms[roomId]={players:[],word:null,drawer:null,guesses:[],chat:[],scores:{}}
                rooms[roomId].players.push(ws);
                ws.roomId=roomId;
                ws.isDrawer=false;
                ws.username=data.username;
                rooms[roomId].scores[ws.username]=0;
                ws.send(JSON.stringify({type:"roomCreated",roomId,message:"Room Created"+ws.username}));
                break;
            case 'join':
                const room = rooms[data.roomId];
                if(room){
                    room.players.push(ws);
                    ws.roomId = data.roomId;
                    ws.isDrawer = false;
                    ws.username=data.username;
                    room.scores[ws.username]=0;
                    ws.send(JSON.stringify({type:"joined",roomId:data.roomId}));
                }else{
                    ws.send(JSON.stringify({type:"error",message:"Room not found"}))
                }
                break;

            case 'start_game':
                startGame(ws.roomId);
                break;
            case 'choose_word':
                chooseWord(ws.roomId,data.word);
                break;
            case 'draw':
                broadcast(ws.roomId,{type:'draw,',...data})
                break;
            case 'guess':
                handleGuess(ws,data.message);
                break;
            case 'chat':
                handleChat(ws,data.message);
                break;

            default:ws.send({type:"waiting to get the response"})
        }
    })

    ws.on('close',()=>{
        if(ws.roomId && rooms[ws.roomId]){
            rooms[ws.roomsId].players=rooms[ws.roomsId].players.filter(client=>client!==ws);
            if(rooms[ws.roomId].players.length===0){
                delete rooms[ws.roomId];
            }

        }
    });
});

function broadcast(roomId,message){
    rooms[roomId].players.forEach(client => {
        if(client.readyState===WebSocket.OPEN){
            client.send(JSON.stringify(message));
        }
        
    });
}

function startGame(roomId){
    const room = rooms[roomId];
    room.drawer = room.players[0];
    const words = ['cat','dog','tree'];
    room.drawer.send(JSON.stringify({type:'choose_word',words}));

}

function chooseWord(roomId,word){
    const room = rooms[roomId];
    room.word=word;
    broadcast(roomId,{type:'startDrawing'});
    startTimer(roomId)
}

function handleGuess(ws,message){
    const room = rooms[ws.roomId];
    if(message === room.word){
        const timeRemaining = room.timeRemaining;
        room.scores[ws.username]+= timeRemaining;

        broadcast(ws.roomId,{type:'correctGuess',user:ws.username}); 
        ws.send(JSON.stringify({type:"Congratulations Your Guess was correct",points:room.scores[ws.username]}));
        room.word = null; 
        announceWinner(ws.roomId)
    }else{
        broadcast(ws.roomId,{type:'chat',message:ws.username+': '+message})
    }
}

function handleChat(ws,message){
    broadcast(ws.roomId,{type:'chat',message:ws.username+': '+message});
}

function generateRoomId(){
    return Math.random().toString(36).substring(2,9);
}
function startTimer(roomId){
    const room = rooms[roomId];
    room.timeRemaining = 60;
    const timer =setInterval(()=>{
        if(room.timeRemaining>0){
            room.timeRemaining--;
            broadcast(roomId,{type:'timer',timeRemaining:room.timeRemaining});
        }else{
            clearInterval(timer);
            broadcast(roomId,{type:"timesUp"})
            announceWinner(roomId);
        }
    },1000)
}

function announceWinner(roomId){
    const room = rooms[roomId];
    if(!room.word){
        let maxScore=-1;
        let winner = null;

        for(const[username,score] of Object.entries(room.scores)){
            if(score>maxScore){
                maxScore=score;
                winner=username
            }
        }
        broadcast(roomId,{type:"winner",user:winner,score:maxScore})
    }
}


server.listen(8080,()=>{
    console.log("Server started on port 8080");
})