import * as THREE from 'three';
import { MultiplayerManager } from './MultiplayerManager';

export class VoiceChatManager {
  private localStream: MediaStream | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private audioObjects: Map<string, THREE.Object3D> = new Map();
  private positionalAudios: Map<string, THREE.PositionalAudio> = new Map();
  private listener: THREE.AudioListener;
  private iceCandidatesQueue: Map<string, RTCIceCandidateInit[]> = new Map();
  
  public isMuted = true;
  private isInitializingMicrophone = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private scene: THREE.Scene,
    private multiplayer: MultiplayerManager
  ) {
    this.listener = new THREE.AudioListener();
    this.camera.add(this.listener);

    // Глобальный обработчик для принудительной разблокировки AudioContext при первом взаимодействии
    const resumeContext = () => {
      if (this.listener && this.listener.context && this.listener.context.state === 'suspended') {
        this.listener.context.resume().then(() => {
          console.log("WebRTC AudioContext: Resumed successfully via user gesture!");
          window.removeEventListener('click', resumeContext);
          window.removeEventListener('touchstart', resumeContext);
          window.removeEventListener('keydown', resumeContext);
        }).catch(err => {
          console.warn("WebRTC AudioContext: Failed to resume:", err);
        });
      }
    };
    window.addEventListener('click', resumeContext);
    window.addEventListener('touchstart', resumeContext);
    window.addEventListener('keydown', resumeContext);

    // Bind WebRTC signaling from MultiplayerManager
    this.multiplayer.onVoiceSignalCallback = (data) => {
      this.handleIncomingSignal(data.senderId, data.signal).catch(err => {
        console.error("Error handling incoming WebRTC signal:", err);
      });
    };
  }

  /**
   * Initializes local microphone stream
   */
  public async initLocalStream(): Promise<boolean> {
    if (this.localStream) return true;
    if (this.isInitializingMicrophone) return false;
    this.isInitializingMicrophone = true;

    try {
      console.log("WebRTC: Requesting microphone access...");
      this.localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      });
      
      // Настраиваем начальное состояние Mute для локальных треков
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
      this.isInitializingMicrophone = false;
      console.log("WebRTC: Microphone access granted!");

      // Внедряем трек во все активные соединения без повторного согласования
      const audioTrack = this.localStream.getAudioTracks()[0];
      for (const [targetId, pc] of this.peers.entries()) {
        const senders = pc.getSenders();
        const sender = senders.find(s => s.track?.kind === 'audio' || s.track === null);
        if (sender && audioTrack) {
          console.log(`WebRTC: Injecting local audio track for peer ${targetId}`);
          sender.replaceTrack(audioTrack).catch(err => {
            console.error(`WebRTC: replaceTrack failed for peer ${targetId}:`, err);
          });
        } else if (audioTrack) {
          // Если сендер не найден, пробуем добавить трек классическим способом
          try {
            pc.addTrack(audioTrack, this.localStream);
          } catch (e) {
            console.warn(`WebRTC: addTrack failed for peer ${targetId}:`, e);
          }
        }
      }

      return true;
    } catch (err) {
      console.error("WebRTC: Failed to access microphone:", err);
      this.isInitializingMicrophone = false;
      return false;
    }
  }

  /**
   * Toggles microphone Mute state
   */
  public async toggleMute(): Promise<boolean> {
    this.isMuted = !this.isMuted;

    // Принудительно разблокируем контекст при переключении состояния
    if (this.listener && this.listener.context && this.listener.context.state === 'suspended') {
      await this.listener.context.resume().catch(err => {
        console.warn("WebRTC AudioContext: Failed to resume in toggleMute:", err);
      });
    }

    if (!this.isMuted && !this.localStream) {
      const success = await this.initLocalStream();
      if (!success) {
        this.isMuted = true;
        return false;
      }
    }

    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }

    console.log(`WebRTC Voice Chat: Microphone is now ${this.isMuted ? 'MUTED' : 'ACTIVE'}`);
    return this.isMuted;
  }

  /**
   * Core proximity update loop. Called on every frame.
   * Manages connection / disconnection of peers based on spatial distance.
   */
  public updateConnections(players: Map<string, any>, localPosition: THREE.Vector3) {
    const myId = (this.multiplayer as any).myId;
    if (!myId) return;

    // Радиусы пространственной слышимости (3000 единиц)
    const activeRadiusSq = 3000 * 3000; // 9,000,000
    const dropRadiusSq = 3300 * 3300;   // 10,890,000

    for (const [playerId, player] of players.entries()) {
      if (playerId === myId || playerId.startsWith('bot_')) continue; // Пропускаем себя и ботов

      const distSq = localPosition.distanceToSquared(player.position);
      const hasConnection = this.peers.has(playerId);

      if (distSq < activeRadiusSq && !hasConnection) {
        // Мы близко! Только игрок с меньшим лексикографическим ID инициирует создание PeerConnection
        if (myId < playerId) {
          console.log(`Proximity WebRTC: Initiating connection to player ${playerId} (Distance: ${Math.sqrt(distSq).toFixed(0)})`);
          this.connectToPeer(playerId);
        }
      } else if (distSq > dropRadiusSq && hasConnection) {
        // Вылетели за радиус слышимости! Разрываем соединение.
        console.log(`Proximity WebRTC: Disconnecting from player ${playerId} (Distance: ${Math.sqrt(distSq).toFixed(0)})`);
        this.disconnectFromPeer(playerId);
      }

      // Обновляем пространственное положение звукового объекта
      const audioObj = this.audioObjects.get(playerId);
      if (audioObj) {
        audioObj.position.copy(player.position);
      }
    }

    // Очистка соединений с игроками, которые покинули сеть
    for (const playerId of this.peers.keys()) {
      if (!players.has(playerId)) {
        console.log(`Network WebRTC: Player ${playerId} left. Cleaning up voice.`);
        this.disconnectFromPeer(playerId);
      }
    }
  }

  /**
   * Unified PeerConnection creation logic
   */
  private createPeerConnection(targetId: string): RTCPeerConnection {
    if (this.peers.has(targetId)) {
      return this.peers.get(targetId)!;
    }

    console.log(`WebRTC: Creating peer connection for ${targetId}`);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });

    // Добавляем локальные треки, если они уже есть
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    } else {
      // Если локального потока еще нет, добавляем трансивер с направлением 'sendrecv',
      // чтобы гарантировать прием удаленного аудиопотока и возможность последующей передачи
      try {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      } catch (e) {
        console.warn("WebRTC: addTransceiver not supported or failed, falling back:", e);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.multiplayer.sendVoiceSignal(targetId, {
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`WebRTC: Received track from peer ${targetId}`, event);
      const remoteStream = event.streams[0];
      
      // iOS / Mobile Safari / Chrome Autoplay hack
      let hiddenAudio = document.getElementById(`audio-hack-${targetId}`) as HTMLAudioElement;
      if (!hiddenAudio) {
        hiddenAudio = document.createElement('audio');
        hiddenAudio.id = `audio-hack-${targetId}`;
        hiddenAudio.autoplay = true;
        hiddenAudio.setAttribute('playsinline', 'true');
        hiddenAudio.muted = true; // глушим, чтобы не двоился звук с PositionalAudio
        hiddenAudio.style.display = 'none';
        document.body.appendChild(hiddenAudio);
      }
      hiddenAudio.srcObject = remoteStream;
      hiddenAudio.play().then(() => {
        console.log(`WebRTC: Autoplay audio-hack started for peer ${targetId}`);
      }).catch(err => {
        console.warn(`WebRTC: Autoplay audio-hack failed for peer ${targetId}:`, err);
      });

      this.setupSpatialAudio(targetId, remoteStream);
    };

    pc.onnegotiationneeded = async () => {
      const myId = (this.multiplayer as any).myId;
      if (myId && myId < targetId) {
        try {
          console.log(`WebRTC: Negotiation needed, creating offer for ${targetId}`);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.multiplayer.sendVoiceSignal(targetId, {
            type: 'offer',
            sdp: pc.localDescription
          });
        } catch (err) {
          console.error("Error creating WebRTC offer during negotiation:", err);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`WebRTC: connection state with ${targetId} is ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        console.warn(`WebRTC: connection with ${targetId} lost or failed.`);
      }
    };

    this.peers.set(targetId, pc);
    return pc;
  }

  /**
   * Initiates direct Peer Connection to remote player
   */
  private connectToPeer(targetId: string) {
    this.createPeerConnection(targetId);
  }

  /**
   * Closes Peer Connection and disposes audio nodes for a player
   */
  public disconnectFromPeer(targetId: string) {
    const pc = this.peers.get(targetId);
    if (pc) {
      pc.close();
      this.peers.delete(targetId);
    }

    // Удаляем скрытый аудио-хак элемент
    const hiddenAudio = document.getElementById(`audio-hack-${targetId}`);
    if (hiddenAudio) {
      hiddenAudio.remove();
    }

    this.iceCandidatesQueue.delete(targetId);
    this.removeSpatialAudio(targetId);
  }

  /**
   * Sets up positional 3D audio listener for remote stream
   */
  private setupSpatialAudio(playerId: string, remoteStream: MediaStream) {
    this.removeSpatialAudio(playerId);

    const audioObj = new THREE.Object3D();
    this.scene.add(audioObj);
    this.audioObjects.set(playerId, audioObj);

    // Three.js PositionalAudio manages the Web Audio API Spatial Panner Nodes automatically
    const posAudio = new THREE.PositionalAudio(this.listener);
    posAudio.setMediaStreamSource(remoteStream);
    posAudio.setRefDistance(150);    // Volume is at 100% within 150 units
    posAudio.setMaxDistance(3000);   // Volume fades linearly to 0% at 3000 units (voice range)
    posAudio.setDistanceModel('linear');
    posAudio.setRolloffFactor(1);

    audioObj.add(posAudio);
    this.positionalAudios.set(playerId, posAudio);

    console.log(`WebRTC Spatial Audio: Configured and playing for player ${playerId}!`);
  }

  /**
   * Disposes Spatial Audio nodes
   */
  private removeSpatialAudio(playerId: string) {
    const audioObj = this.audioObjects.get(playerId);
    if (audioObj) {
      this.scene.remove(audioObj);
      this.audioObjects.delete(playerId);
    }

    const posAudio = this.positionalAudios.get(playerId);
    if (posAudio) {
      try {
        posAudio.disconnect();
      } catch (e) {
        // Safe disposal
      }
      this.positionalAudios.delete(playerId);
    }
  }

  /**
   * Handles incoming WebRTC signaling data
   */
  private async handleIncomingSignal(senderId: string, signal: any) {
    let pc = this.peers.get(senderId);

    if (signal.type === 'offer') {
      console.log(`WebRTC: Received offer from peer ${senderId}`);
      if (!pc) {
        pc = this.createPeerConnection(senderId);
      }

      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      
      // Обрабатываем накопившиеся кандидаты после установки remoteDescription
      await this.processQueuedCandidates(senderId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.multiplayer.sendVoiceSignal(senderId, {
        type: 'answer',
        sdp: pc.localDescription
      });

    } else if (signal.type === 'answer') {
      console.log(`WebRTC: Received answer from peer ${senderId}`);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        // Обрабатываем накопившиеся кандидаты после установки remoteDescription
        await this.processQueuedCandidates(senderId, pc);
      }
    } else if (signal.type === 'candidate') {
      if (pc) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.error(`WebRTC: Error adding candidate for ${senderId}:`, e);
          }
        } else {
          // Если remoteDescription еще не установлен, добавляем в очередь
          if (!this.iceCandidatesQueue.has(senderId)) {
            this.iceCandidatesQueue.set(senderId, []);
          }
          this.iceCandidatesQueue.get(senderId)!.push(signal.candidate);
        }
      }
    }
  }

  /**
   * Processes all stored candidates
   */
  private async processQueuedCandidates(playerId: string, pc: RTCPeerConnection) {
    const queue = this.iceCandidatesQueue.get(playerId);
    if (queue) {
      console.log(`WebRTC: Processing ${queue.length} queued candidates for ${playerId}`);
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error(`WebRTC: Error adding queued candidate for ${playerId}:`, e);
        }
      }
      this.iceCandidatesQueue.delete(playerId);
    }
  }

  /**
   * Checks if a player is currently actively transmitting voice (speaking indicator)
   */
  public isPlayerSpeaking(playerId: string): boolean {
    return this.positionalAudios.has(playerId);
  }

  /**
   * Destroys all connections (e.g. on player death or game exit)
   */
  public destroy() {
    for (const [targetId, pc] of this.peers.entries()) {
      pc.close();
      const hiddenAudio = document.getElementById(`audio-hack-${targetId}`);
      if (hiddenAudio) hiddenAudio.remove();
    }
    this.peers.clear();

    for (const audioObj of this.audioObjects.values()) {
      this.scene.remove(audioObj);
    }
    this.audioObjects.clear();

    for (const posAudio of this.positionalAudios.values()) {
      try {
        posAudio.disconnect();
      } catch (e) {}
    }
    this.positionalAudios.clear();
    this.iceCandidatesQueue.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
  }
}
