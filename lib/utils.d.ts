import { h } from 'koishi';
/**
 * 模糊查询关键词
 */
export declare function fuzzyQuery(text: string, keywords: string[]): boolean;
/**
 * 从消息内容中提取文本
 */
export declare function getMessageContent(content: unknown): string;
/**
 * 提取对话内容（过滤动作描述等）
 */
export declare function extractDialogueContent(text: string): string | null;
/**
 * 判断是否为 weixin/openclaw 平台
 */
export declare function isWeixinLikePlatform(platform?: string): boolean;
/**
 * 构建音频消息元素（data-uri）
 */
export declare function makeAudioElement(buffer: Buffer, format: string): h;
/**
 * 将音频写入临时文件，返回绝对路径
 */
export declare function writeTempAudioFile(buffer: Buffer, format: string): Promise<string>;
/**
 * 构建 weixin 兼容文件消息元素（走 file:// URL）
 */
export declare function makeWeixinFileElement(filePath: string): h;
/**
 * 构建 weixin 兼容语音消息元素（走 file:// URL）
 */
export declare function makeWeixinAudioElement(filePath: string): h;
/**
 * 删除临时文件（忽略异常）
 */
export declare function removeTempFile(filePath?: string): Promise<void>;
/**
 * 判断是否为 OneBot/QQ 平台
 */
export declare function isOneBotPlatform(platform?: string): boolean;
/**
 * 将音频转换为 SILK 格式（用于 QQ 等需要 SILK 的适配器）
 */
export declare function convertToSilk(audioBuffer: Buffer, logger: any): Promise<Buffer | null>;
