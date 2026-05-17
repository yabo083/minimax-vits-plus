import { Context } from 'koishi'
import { StructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { Config as ConfigType } from './types'
import { AudioCacheManager } from './cache'
import { generateSpeech } from './api'

const CHATLUNA_TIMEOUT = 10000
const MAX_RETRIES = 2
const RETRY_DELAY = 1000

export const VITS_TOOL_SCHEMA = z.object({
  text: z.string().min(1).max(500).describe('要转换成语音的自然语言文本。只传需要朗读的内容，不要包含动作描写、代码块或解释。'),
  voiceId: z.string().optional().describe('可选语音 ID；不填时使用插件默认音色。'),
  speed: z.number().min(0.5).max(2).optional().describe('可选语速，0.5 到 2.0。'),
})

function normalizePathPart(value: string | undefined, fallback: string) {
  const text = String(value || fallback || '').trim() || fallback
  return text.startsWith('/') ? text : `/${text}`
}

function buildPublicUrl(config: ConfigType, fileName: string) {
  const localPath = normalizePathPart(config.tool?.localPublicPath, '/minimax-vits')
  const base = String(config.tool?.publicBaseUrl || config.publicBaseUrl || '').trim().replace(/\/$/, '')
  const publicPath = `${localPath}/audio/${encodeURIComponent(fileName)}`
  return base ? `${base}${publicPath}` : publicPath
}

export class MinimaxVitsTool extends StructuredTool {
  name: string
  description: string
  schema: any = VITS_TOOL_SCHEMA

  constructor(
    protected ctx: Context,
    protected config: ConfigType,
    protected cacheManager?: AudioCacheManager,
  ) {
    super({})
    this.name = config.tool?.name?.trim() || 'minimax_vits_speech'
    this.description = config.tool?.description?.trim()
      || 'Convert selected assistant dialogue text into a MiniMax VITS audio message. Use only when the user wants voice output or when speaking aloud would improve the reply.'
  }

  async _call(input: z.infer<typeof VITS_TOOL_SCHEMA>): Promise<string> {
    const logger = this.ctx.logger('minimax-vits')
    const text = String(input?.text || '').trim()
    if (!text) {
      return JSON.stringify({ ok: false, error: 'text is required' }, null, 2)
    }

    const voiceId = String(input?.voiceId || this.config.defaultVoice || 'Chinese_female_gentle').trim()
    const runtimeConfig: ConfigType = {
      ...this.config,
      speed: input?.speed ?? this.config.speed,
      audioFormat: 'mp3',
    }
    const buffer = await generateSpeech(this.ctx, runtimeConfig, text, voiceId, this.cacheManager)
    if (!buffer || buffer.length === 0) {
      return JSON.stringify({ ok: false, error: 'MiniMax TTS generation failed', voiceId, text }, null, 2)
    }

    const hash = createHash('sha256').update(JSON.stringify({
      voiceId,
      text,
      speed: runtimeConfig.speed,
      vol: runtimeConfig.vol,
      pitch: runtimeConfig.pitch,
      model: runtimeConfig.speechModel,
      sampleRate: runtimeConfig.sampleRate,
      bitrate: runtimeConfig.bitrate,
      format: 'mp3',
    })).digest('hex').slice(0, 32)
    const fileName = `${hash}.mp3`
    const dir = path.resolve(this.ctx.baseDir, this.config.tool?.outputDir || './data/minimax-vits/tool')
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, fileName), buffer)

    const audioUrl = buildPublicUrl(this.config, fileName)
    logger.info(`ChatLuna VITS tool generated audio: ${fileName}, bytes=${buffer.length}`)
    return JSON.stringify({
      ok: true,
      text,
      voiceId,
      audioUrl,
      audioElement: `<audio src="${audioUrl}"/>`,
      bytes: buffer.length,
      format: 'mp3',
      instruction: 'Send audioElement to the user when you want to deliver the generated voice. Do not repeat the raw JSON to the user.',
    }, null, 2)
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function selectSpeechSentenceByAI(
  ctx: Context,
  config: ConfigType,
  text: string,
  logger: any
): Promise<string | null> {
  const sentences = text.split(/[。！？.!?\n]+/).filter(s => s.trim().length > 0)
  
  if (sentences.length <= 1) {
    if (config.debug) logger?.info('文本只有一个句子，跳过 AI 筛选')
    return null
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const chatluna = (ctx as any).chatluna
      if (!chatluna) {
        if (config.debug) logger?.info('ChatLuna 服务未找到')
        return null
      }

      const prompt = `从以下文本中选出一句最适合语音朗读的内容。只返回选中的句子，不要添加任何解释、标点和空格：

${text}

选出的句子：`

      const chatOptions: any = {
        timeout: CHATLUNA_TIMEOUT
      }
      
      let response: any
      if (typeof chatluna.chat === 'function') {
        response = await chatluna.chat(prompt, chatOptions)
      } else if (typeof chatluna.complete === 'function') {
        response = await chatluna.complete(prompt, chatOptions)
      } else if (typeof chatluna.generate === 'function') {
        response = await chatluna.generate(prompt, chatOptions)
      } else {
        if (config.debug) logger?.warn('ChatLuna 未找到可用的调用方法')
        return null
      }

      let selected = ''
      if (typeof response === 'string') {
        selected = response.trim()
      } else if (response?.content) {
        selected = response.content.trim()
      } else if (response?.text) {
        selected = response.text.trim()
      } else if (response?.choices?.[0]?.message?.content) {
        selected = response.choices[0].message.content.trim()
      }

      if (!selected || selected.length < (config.autoSpeech?.minLength ?? 2)) {
        return null
      }

      const cleanedSelected = selected.replace(/^[。！？.!?\s]+|[。！？.!?\s]+$/g, '').trim()
      if (cleanedSelected.length >= (config.autoSpeech?.minLength ?? 2)) {
        if (config.debug) logger?.info(`ChatLuna 选择的句子: ${cleanedSelected.slice(0, 30)}...`)
        return cleanedSelected
      }

      return null
    } catch (error: any) {
      if (config.debug) logger?.warn(`ChatLuna 调用失败 (尝试 ${attempt + 1}/${MAX_RETRIES + 1}):`, error?.message || error)
      
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY)
        continue
      }
      
      logger?.warn('ChatLuna 模型选择语音句子失败，已达最大重试次数')
      return null
    }
  }
  
  return null
}
