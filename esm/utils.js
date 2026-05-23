// 工具函数
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { h } from 'koishi';
/**
 * 模糊查询关键词
 */
export function fuzzyQuery(text, keywords) {
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}
/**
 * 从消息内容中提取文本
 */
export function getMessageContent(content) {
    if (typeof content === 'string')
        return content;
    if (content && typeof content === 'object') {
        const obj = content;
        return (obj.text || obj.content || JSON.stringify(content));
    }
    return String(content);
}
/**
 * 提取对话内容（过滤动作描述等）
 */
export function extractDialogueContent(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let dialogueContent = '';
    let inDialogue = false;
    for (const line of lines) {
        const isDialogueLine = line.startsWith('"') ||
            line.startsWith("'") ||
            line.includes('说：') ||
            /^[A-Za-z\u4e00-\u9fff]+[：:]/.test(line);
        const isNonDialogue = (line.includes('（') && line.includes('）')) ||
            (line.includes('(') && line.includes(')')) ||
            /^\s*[\[\{【（(]/.test(line);
        if (isDialogueLine && !isNonDialogue) {
            let cleanLine = line
                .replace(/^["\'"']/, '')
                .replace(/["\'"']$/, '')
                .replace(/^[A-Za-z\u4e00-\u9fff]+[：:]\s*/, '')
                .replace(/说：|说道：/g, '')
                .trim();
            if (cleanLine.length > 0) {
                dialogueContent += cleanLine + '。';
                inDialogue = true;
            }
        }
        else if (inDialogue && line.length > 0 && !isNonDialogue) {
            dialogueContent += line + '。';
        }
    }
    if (dialogueContent.length > 0) {
        return dialogueContent.replace(/。+/g, '。').trim();
    }
    if (text.length <= 150 && !/[[{【（(]/.test(text)) {
        return text;
    }
    return null;
}
/**
 * 判断是否为 weixin/openclaw 平台
 */
export function isWeixinLikePlatform(platform) {
    if (!platform)
        return false;
    const lower = String(platform).toLowerCase();
    return lower.includes('weixin') || lower.includes('openclaw');
}
export function isOneBotPlatform(platform) {
    if (!platform)
        return false;
    const lower = String(platform).toLowerCase();
    return lower.includes('onebot') || lower === 'qq';
}
/**
 * 构建音频消息元素（data-uri）
 */
export function makeAudioElement(buffer, format) {
    const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const src = `data:${mimeType};base64,${buffer.toString('base64')}`;
    return h('audio', { src });
}
/**
 * 将音频写入临时文件，返回绝对路径
 */
export async function writeTempAudioFile(buffer, format) {
    const ext = format === 'wav' ? 'wav' : 'mp3';
    const dir = path.resolve('./data/minimax-vits/outbound');
    await fs.mkdir(dir, { recursive: true });
    const fileName = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, buffer);
    return filePath;
}
/**
 * 构建 weixin 兼容文件消息元素（走 file:// URL）
 */
export function makeWeixinFileElement(filePath) {
    const fileUrl = pathToFileURL(path.resolve(filePath)).href;
    return h.file(fileUrl);
}
/**
 * 构建 weixin 兼容语音消息元素（走 file:// URL）
 */
export function makeWeixinAudioElement(filePath) {
    const fileUrl = pathToFileURL(path.resolve(filePath)).href;
    return h('audio', { src: fileUrl });
}
/**
 * 删除临时文件（忽略异常）
 */
export async function removeTempFile(filePath) {
    if (!filePath)
        return;
    try {
        await fs.unlink(filePath);
    }
    catch {
        // ignore
    }
}
export async function convertToSilk(buffer, logger) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const silk = await import('silk-wasm');
        const encode = silk.encode || ((_a = silk.default) === null || _a === void 0 ? void 0 : _a.encode);
        if (typeof encode !== 'function') {
            (_b = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _b === void 0 ? void 0 : _b.call(logger, 'silk-wasm encode function is unavailable');
            return null;
        }
        const isWav = silk.isWav || ((_c = silk.default) === null || _c === void 0 ? void 0 : _c.isWav);
        const getWavFileInfo = silk.getWavFileInfo || ((_d = silk.default) === null || _d === void 0 ? void 0 : _d.getWavFileInfo);
        let sampleRate = 24000;
        if (typeof isWav === 'function' && isWav(buffer)) {
            sampleRate = 0;
            try {
                const info = typeof getWavFileInfo === 'function' ? getWavFileInfo(buffer) : undefined;
                (_e = logger === null || logger === void 0 ? void 0 : logger.debug) === null || _e === void 0 ? void 0 : _e.call(logger, `SILK conversion detected WAV input, sampleRate=${(_g = (_f = info === null || info === void 0 ? void 0 : info.fmt) === null || _f === void 0 ? void 0 : _f.sampleRate) !== null && _g !== void 0 ? _g : 'unknown'}`);
            }
            catch {
                // ignore metadata logging failures
            }
        }
        const result = await encode(buffer, sampleRate);
        return Buffer.from((_h = result === null || result === void 0 ? void 0 : result.data) !== null && _h !== void 0 ? _h : result);
    }
    catch (error) {
        (_j = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _j === void 0 ? void 0 : _j.call(logger, 'SILK conversion failed:', error);
        return null;
    }
}
