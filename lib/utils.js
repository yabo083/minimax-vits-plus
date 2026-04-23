"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fuzzyQuery = fuzzyQuery;
exports.getMessageContent = getMessageContent;
exports.extractDialogueContent = extractDialogueContent;
exports.isWeixinLikePlatform = isWeixinLikePlatform;
exports.makeAudioElement = makeAudioElement;
exports.writeTempAudioFile = writeTempAudioFile;
exports.makeWeixinFileElement = makeWeixinFileElement;
exports.makeWeixinAudioElement = makeWeixinAudioElement;
exports.removeTempFile = removeTempFile;
// 工具函数
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const koishi_1 = require("koishi");
/**
 * 模糊查询关键词
 */
function fuzzyQuery(text, keywords) {
    const lowerText = text.toLowerCase();
    return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}
/**
 * 从消息内容中提取文本
 */
function getMessageContent(content) {
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
function extractDialogueContent(text) {
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
function isWeixinLikePlatform(platform) {
    if (!platform)
        return false;
    const lower = String(platform).toLowerCase();
    return lower.includes('weixin') || lower.includes('openclaw');
}
/**
 * 构建音频消息元素（data-uri）
 */
function makeAudioElement(buffer, format) {
    const mimeType = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
    const src = `data:${mimeType};base64,${buffer.toString('base64')}`;
    return (0, koishi_1.h)('audio', { src });
}
/**
 * 将音频写入临时文件，返回绝对路径
 */
async function writeTempAudioFile(buffer, format) {
    const ext = format === 'wav' ? 'wav' : 'mp3';
    const dir = node_path_1.default.resolve('./data/minimax-vits/outbound');
    await node_fs_1.promises.mkdir(dir, { recursive: true });
    const fileName = `tts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const filePath = node_path_1.default.join(dir, fileName);
    await node_fs_1.promises.writeFile(filePath, buffer);
    return filePath;
}
/**
 * 构建 weixin 兼容文件消息元素（走 file:// URL）
 */
function makeWeixinFileElement(filePath) {
    const fileUrl = (0, node_url_1.pathToFileURL)(node_path_1.default.resolve(filePath)).href;
    return koishi_1.h.file(fileUrl);
}
/**
 * 构建 weixin 兼容语音消息元素（走 file:// URL）
 */
function makeWeixinAudioElement(filePath) {
    const fileUrl = (0, node_url_1.pathToFileURL)(node_path_1.default.resolve(filePath)).href;
    return (0, koishi_1.h)('audio', { src: fileUrl });
}
/**
 * 删除临时文件（忽略异常）
 */
async function removeTempFile(filePath) {
    if (!filePath)
        return;
    try {
        await node_fs_1.promises.unlink(filePath);
    }
    catch {
        // ignore
    }
}
