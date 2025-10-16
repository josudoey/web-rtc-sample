function generateToken() {
  return Math.random().toString(36).slice(2)
}

function createPeerWebSocket(id: string): Promise<WebSocket> {
  return new Promise(function (resolve, reject) {
    const token = generateToken()
    const socket = new WebSocket(
      `wss://0.peerjs.com/peerjs?key=peerjs&id=${id}&token=${token}`
    )

    socket.addEventListener('open', (e) => {
      const heartbeat = setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) return
        socket.send(JSON.stringify({ type: 'HEARTBEAT' }))
      }, 5000)
      socket.addEventListener('close', (e) => {
        clearInterval(heartbeat)
      })
    })

    const awaitPeerOpen = (e: MessageEvent) => {
      const payload = JSON.parse(e.data)
      switch (payload.type) {
        case 'OPEN': {
          socket.removeEventListener('message', awaitPeerOpen)
          socket.removeEventListener('error', reject)
          resolve(socket)
        }
        case 'ID-TAKEN': {
          reject(new Error('id taken'))
        }
      }
    }

    socket.addEventListener('message', awaitPeerOpen)
    socket.addEventListener('error', reject)
  })
}

interface OfferMessage {
  peerId: string
  offer: RTCSessionDescriptionInit
}
function sendOfferMessage(socket: WebSocket, message: OfferMessage) {
  socket.send(
    JSON.stringify({
      dst: message.peerId,
      type: 'OFFER',
      payload: {
        sdp: message.offer
      }
    })
  )
}

function recvOfferMessage(socket: WebSocket): Promise<OfferMessage> {
  return new Promise(function (resolve, reject) {
    socket.addEventListener('message', function (e) {
      const data = JSON.parse(e.data)
      const { payload } = data
      switch (data.type) {
        case 'OFFER': {
          resolve({
            peerId: data.src,
            offer: payload.sdp
          })
        }
      }
    })
    socket.addEventListener('close', function () {
      reject(new Error('socket closed'))
    })
  })
}

interface AnswerMessage {
  peerId: string
  answer: RTCSessionDescriptionInit
}
function sendAnswerMessage(socket: WebSocket, message: AnswerMessage) {
  socket.send(
    JSON.stringify({
      dst: message.peerId,
      type: 'ANSWER',
      payload: {
        sdp: message.answer
      }
    })
  )
}

function recvAnswerMessage(socket: WebSocket): Promise<AnswerMessage> {
  return new Promise(function (resolve, reject) {
    socket.addEventListener('message', function (e) {
      const data = JSON.parse(e.data)
      const { payload } = data
      switch (data.type) {
        case 'ANSWER': {
          resolve({
            peerId: data.src,
            answer: payload.sdp
          })
        }
      }
    })
    socket.addEventListener('close', function () {
      reject(new Error('socket closed'))
    })
  })
}

interface CandidateMessage {
  peerId: string
  candidate: RTCIceCandidate
}
function sendCandidateMessage(socket: WebSocket, message: CandidateMessage) {
  socket.send(
    JSON.stringify({
      dst: message.peerId,
      type: 'CANDIDATE',
      payload: message.candidate
    })
  )
}

export async function makeCallIn(peer: RTCPeerConnection, peerId: string) {
  const socket = await createPeerWebSocket(peerId)
  peer.addEventListener('connectionstatechange', (e) => {
    if (peer.connectionState !== 'connected') return
    if (socket.readyState !== socket.OPEN) return
    socket.close()
  })

  const message = await recvOfferMessage(socket)
  socket.addEventListener('message', function (e) {
    const data = JSON.parse(e.data)
    const { payload } = data
    switch (data.type) {
      case 'CANDIDATE': {
        if (data.src !== message.peerId) return
        peer.addIceCandidate(payload as RTCIceCandidateInit)
      }
    }
  })
  peer.addEventListener('icecandidate', (e) => {
    if (!e.candidate) return
    sendCandidateMessage(socket, {
      peerId: message.peerId,
      candidate: e.candidate
    })
  })
  peer.setRemoteDescription(message.offer)

  const answer = await peer.createAnswer()
  peer.setLocalDescription(answer)
  sendAnswerMessage(socket, {
    peerId: message.peerId,
    answer: answer
  })

  return peer
}

export async function makeCallOut(peer: RTCPeerConnection, peerId: string) {
  const socket = await createPeerWebSocket(crypto.randomUUID())
  peer.addEventListener('connectionstatechange', (e) => {
    if (peer.connectionState !== 'connected') return
    if (socket.readyState !== socket.OPEN) return
    socket.close()
  })
  socket.addEventListener('message', function (e) {
    const data = JSON.parse(e.data)
    const { payload } = data
    switch (data.type) {
      case 'CANDIDATE': {
        if (data.src !== peerId) return
        peer.addIceCandidate(payload as RTCIceCandidateInit)
      }
    }
  })

  peer.addEventListener('icecandidate', (e) => {
    if (!e.candidate) {
      return
    }

    sendCandidateMessage(socket, {
      peerId,
      candidate: e.candidate
    })
  })

  const offer = await peer.createOffer()
  peer.setLocalDescription(offer)
  sendOfferMessage(socket, {
    peerId,
    offer
  })

  const message = await recvAnswerMessage(socket)
  peer.setRemoteDescription(message.answer)
  return peer
}
