'use client'

import type React from 'react'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send } from 'lucide-react'
import { makeCallIn, makeCallOut } from '@/lib/rtc-peer'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'

async function connect(peer: RTCPeerConnection, peerId: string) {
  try {
    await makeCallIn(peer, peerId)
  } catch (err) {
    const channel = peer.createDataChannel('default')
    await makeCallOut(peer, peerId)
    return channel
  }

  const channel = await new Promise<RTCDataChannel>(function (resolve) {
    peer.addEventListener('datachannel', (e) => {
      const { channel } = e
      resolve(channel)
    })
  })

  return channel
}

interface Message {
  id: string
  text: string
  timestamp: Date
  type: 'sent' | 'received'
}

export function ConnectionCard() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const peerRef = useRef<RTCPeerConnection>(null)
  const channelRef = useRef<RTCDataChannel>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [state, setState] = useState<RTCDataChannelState>('connecting')
  const [peerId, setPeerId] = useState(searchParams.get('id') || '')

  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleChangeConnectionId = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPeerId(e.target.value)
    const params = new URLSearchParams(searchParams.toString())
    params.set('id', e.target.value)
    router.push(pathname + '?' + params.toString())
  }

  const handleDisconnect = () => {
    setMessages([])
    if (channelRef.current) {
      channelRef.current.close()
      channelRef.current = null
    }

    if (peerRef.current) {
      peerRef.current.close()
      peerRef.current = null
    }
  }

  const handleConnect = async () => {
    if (!peerId.trim()) return
    setIsConnecting(true)
    const peer = new RTCPeerConnection()
    peerRef.current = peer
    try {
      const channel = await connect(peer, peerId)
      channelRef.current = channel
      setState(channel.readyState)
      const updateState = () => {
        setState(channel.readyState)
      }

      channel.addEventListener('open', updateState)
      channel.addEventListener('closing', updateState)
      channel.addEventListener('close', () => {
        updateState()
        handleDisconnect()
      })
      channel.addEventListener('message', (e) => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            text: e.data,
            timestamp: new Date(),
            type: 'received'
          }
        ])
      })
    } catch (err) {
      peerRef.current = null
      return
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSendMessage = () => {
    if (
      !messageInput.trim() ||
      !channelRef.current ||
      channelRef.current.readyState !== 'open'
    )
      return

    const newMessage: Message = {
      id: Date.now().toString(),
      text: messageInput,
      timestamp: new Date(),
      type: 'sent'
    }

    setMessages((prev) => [...prev, newMessage])
    channelRef.current.send(messageInput)
    setMessageInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <Card className='w-full max-w-md mx-auto'>
      <CardHeader className='pb-4'>
        <CardTitle className='flex items-center gap-2'>
          連線狀態: {state === 'open' ? '已連線' : '未連線'}
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* 連線區域 */}
        {state !== 'open' && (
          <div className='space-y-3'>
            <div className='space-y-2'>
              <label htmlFor='connection-id' className='text-sm font-medium'>
                連線 ID
              </label>
              <Input
                id='connection-id'
                value={peerId}
                onChange={handleChangeConnectionId}
                disabled={isConnecting}
              />
            </div>
            <Button
              onClick={handleConnect}
              disabled={!peerId.trim() || !!peerRef.current}
              className='w-full'
            >
              {isConnecting ? '連線中...' : '連線'}
            </Button>
          </div>
        )}
        {/* 已連線狀態 */}
        {state === 'open' && (
          <>
            <div className='flex items-center justify-between'>
              <span className='text-sm text-muted-foreground'>
                已連線到: {peerId}
              </span>
              <Button variant='outline' size='sm' onClick={handleDisconnect}>
                斷線
              </Button>
            </div>

            {/* 訊息顯示區域 */}
            <div className='space-y-2'>
              <label className='text-sm font-medium'>訊息</label>
              <ScrollArea className='h-64 w-full border rounded-md p-3'>
                <div className='space-y-3'>
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.type === 'sent'
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          message.type === 'sent'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <p>{message.text}</p>
                        <p className='text-xs opacity-70 mt-1'>
                          {message.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            </div>

            {/* 訊息輸入區域 */}
            <div className='space-y-2'>
              <label htmlFor='message-input' className='text-sm font-medium'>
                發送訊息
              </label>
              <div className='flex gap-2'>
                <Input
                  id='message-input'
                  placeholder='輸入訊息...'
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim()}
                  size='icon'
                >
                  <Send className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
