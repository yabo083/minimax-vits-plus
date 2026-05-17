// src/service.ts
import { h, Service } from 'koishi';
import { generateSpeech } from './api';
import { convertToSilk, isOneBotPlatform, makeAudioElement } from './utils';
export class MinimaxVitsService extends Service {
    // 修复：必须声明为 public，以匹配 Koishi Service 基类的定义
    constructor(ctx, config) {
        super(ctx, 'minimax-vits');
        this.config = config;
    }
    // 更新配置
    async updateConfig(config) {
        this.config = config;
    }
    // 获取当前配置的摘要（用于前端显示等）
    getConfigSummary() {
        var _a, _b, _c, _d;
        return {
            apiBase: this.config.apiBase,
            model: this.config.speechModel,
            voice: this.config.defaultVoice,
            hasKey: !!this.config.ttsApiKey,
            params: {
                speed: this.config.speed,
                vol: this.config.vol,
                pitch: (_a = this.config.pitch) !== null && _a !== void 0 ? _a : 0,
                sampleRate: (_b = this.config.sampleRate) !== null && _b !== void 0 ? _b : 32000,
                bitrate: (_c = this.config.bitrate) !== null && _c !== void 0 ? _c : 128000,
                format: (_d = this.config.audioFormat) !== null && _d !== void 0 ? _d : 'mp3'
            }
        };
    }
}
export class MinimaxVitsNativeVitsService extends Service {
    constructor(ctx, config, cacheManager) {
        super(ctx, 'vits', true);
        this.config = config;
        this.cacheManager = cacheManager;
    }
    async updateConfig(config, cacheManager) {
        this.config = config;
        this.cacheManager = cacheManager;
    }
    resolveVoiceId(options) {
        var _a, _b;
        const speakerId = options === null || options === void 0 ? void 0 : options.speaker_id;
        const mapped = speakerId != null ? (_b = (_a = this.config.vits) === null || _a === void 0 ? void 0 : _a.speakerMap) === null || _b === void 0 ? void 0 : _b[String(speakerId)] : undefined;
        return mapped || this.config.defaultVoice || 'Chinese_female_gentle';
    }
    async say(options) {
        var _a, _b;
        const logger = this.ctx.logger('minimax-vits');
        const input = String((options === null || options === void 0 ? void 0 : options.input) || '').trim();
        if (!input)
            return h.text('');
        const isOneBot = isOneBotPlatform((_a = options === null || options === void 0 ? void 0 : options.session) === null || _a === void 0 ? void 0 : _a.platform);
        const format = isOneBot ? 'wav' : ((_b = this.config.audioFormat) !== null && _b !== void 0 ? _b : 'mp3');
        const buffer = await generateSpeech(this.ctx, this.config, input, this.resolveVoiceId(options), this.cacheManager, format);
        if (!(buffer === null || buffer === void 0 ? void 0 : buffer.length)) {
            logger.warn('vits.say generated empty audio');
            return h.text(input);
        }
        if (isOneBot) {
            const silkBuffer = await convertToSilk(buffer, logger);
            if (silkBuffer === null || silkBuffer === void 0 ? void 0 : silkBuffer.length) {
                logger.info(`vits.say returns QQ native silk audio, bytes=${silkBuffer.length}`);
                return h.audio(silkBuffer, 'audio/silk');
            }
            logger.warn('vits.say silk conversion failed; fallback to wav audio element');
            return h.audio(buffer, 'audio/wav');
        }
        return makeAudioElement(buffer, format);
    }
}
