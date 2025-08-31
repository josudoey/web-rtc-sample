'use client'

import { RTCPeerCard } from '@/app/RTCPeerCard'

export default function Home() {
  return (
    <main className='min-h-screen bg-background p-8'>
      <div className='max-w-md mx-auto'>
        <h1 className='text-2xl font-bold text-center mb-8'>WebRTC連線</h1>
        <RTCPeerCard />
      </div>
    </main>
  )
}
