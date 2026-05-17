// src/service.ts
import { Context, h, Service, Session } from 'koishi'
import { Config } from './types'
import { AudioCacheManager } from './cache'
import { generateSpeech } from './api'
import { convertToSilk, isOneBotPlatform, makeAudioElement } from './utils'

export class MinimaxVitsService extends Service {
  // 修复：必须声明为 public，以匹配 Koishi Service 基类的定义
  constructor(ctx: Context, public config: Config) {
    super(ctx, 'minimax-vits')
  }

  // 更新配置
  async updateConfig(config: Config) {
    this.config = config
  }

  // 获取当前配置的摘要（用于前端显示等）
  getConfigSummary() {
    return {
      apiBase: this.config.apiBase,
      model: this.config.speechModel,
      voice: this.config.defaultVoice,
      hasKey: !!this.config.ttsApiKey,
      params: {
        speed: this.config.speed,
        vol: this.config.vol,
        pitch: this.config.pitch ?? 0,
        sampleRate: this.config.sampleRate ?? 32000,
        bitrate: this.config.bitrate ?? 128000,
        format: this.config.audioFormat ?? 'mp3'
      }
    }
  }
}

export interface VitsSayOptions {
  input: string
  speaker_id?: number
  session?: Session
}

export class MinimaxVitsNativeVitsService extends Service {
  constructor(
    ctx: Context,
    public config: Config,
    private cacheManager?: AudioCacheManager,
  ) {
    super(ctx, 'vits', true)
  }

  async updateConfig(config: Config, cacheManager?: AudioCacheManager) {
    this.config = config
    this.cacheManager = cacheManager
  }

  private resolveVoiceId(options?: VitsSayOptions) {
    const speakerId = options?.speaker_id
    const mapped = speakerId != null ? this.config.vits?.speakerMap?.[String(speakerId)] : undefined
    return mapped || this.config.defaultVoice || 'Chinese_female_gentle'
  }

  async say(options: VitsSayOptions) {
    const logger = this.ctx.logger('minimax-vits')
    const input = String(options?.input || '').trim()
    if (!input) return h.text('')

    const isOneBot = isOneBotPlatform(options?.session?.platform)
    const format = isOneBot ? 'wav' : (this.config.audioFormat ?? 'mp3')
    const buffer = await generateSpeech(
      this.ctx,
      this.config,
      input,
      this.resolveVoiceId(options),
      this.cacheManager,
      format,
    )

    if (!buffer?.length) {
      logger.warn('vits.say generated empty audio')
      return h.text(input)
    }

    if (isOneBot) {
      const silkBuffer = await convertToSilk(buffer, logger)
      if (silkBuffer?.length) {
        logger.info(`vits.say returns QQ native silk audio, bytes=${silkBuffer.length}`)
        return h.audio(silkBuffer, 'audio/silk')
      }
      logger.warn('vits.say silk conversion failed; fallback to wav audio element')
      return h.audio(buffer, 'audio/wav')
    }

    return makeAudioElement(buffer, format)
  }
}
