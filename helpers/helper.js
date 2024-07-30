export function generateRoomId(){
    return Math.random().toString(36).substring(2,9);
}

export function broadcast(roomId,message){
    rooms[roomId].players.forEach(client => {
        if(client.readyState===WebSocket.OPEN){
            client.send(JSON.stringify(message));
        }
        
    });
}

export function startGame(roomId){
    const room = rooms[roomId];
    room.drawer = room.players[0];
    const words = ['cat','dog','tree'];
    room.drawer.send(JSON.stringify({type:'choose_word',words}));

}

export function chooseWord(roomId,word){
    const room = rooms[roomId];
    room.word=word;
    broadcast(roomId,{type:'startDrawing'});
    startTimer(roomId)
}

export function handleGuess(ws,message){
    const room = rooms[ws.roomId];
    if(message === room.word){
        broadcast(ws.roomId,{type:'correctGuess',user:ws.username}); 
        ws.send(JSON.stringify({type:"Congratulations Your Guess was correct"}));
        room.word = null; 
    }else{
        broadcast(ws.roomId,{type:'chat',message:ws.username+':'+message})
    }
}
export function handleChat(ws,message){
    broadcast(ws.roomId,{type:'chat',message:ws.username+':'+message});
}

function startTimer(roomId){
    let timeRemaining = 60;
    const timer =setInterval(()=>{
        if(timeRemaining>0){
            timeRemaining--;
            broadcast(roomId,{type:'timer',timeRemaining});
        }else{
            clearInterval(timer);
            broadcast(roomId,{type:"timesUp"})
        }
    },1000)
}