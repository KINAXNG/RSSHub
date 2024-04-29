import { Route } from '@/types';
import { getCurrentPath } from '@/utils/helpers';
const __dirname = getCurrentPath(import.meta.url);

import cache from '@/utils/cache';
import got from '@/utils/got';
import { art } from '@/utils/render';
import * as path from 'node:path';
import { parseDate } from '@/utils/parse-date';
import { config } from '@/config';
const rootUrl = 'https://devapi.qweather.com/v7/warning/now?';
export const route: Route = {
    path: '/warning/:location',
    categories: ['forecast'],
    example: '/qweather/warning/广州',
    parameters: { location: 'N' },
    features: {
        requireConfig: [
            {
                name: 'HEFENG_KEY',
                description: '',
            },
        ],
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    name: '天气灾害预警',
    maintainers: ['KINAXNG'],
    handler,
    description: `需自行注册获取 api 的 key，每小时更新一次数据`,
};

const CACHE_CONTENT_EXPIRE = 2592000; // 为当前路由设定的缓存过期时间为1个月

async function handler(ctx) {
    const location = ctx.req.param('location');

    // 首先尝试获取最新的API响应（无论是否包含警告）
    let latestResponse = await cache.get(location + '_latest');
    let lastValidWarning = await cache.get(location + '_last_valid_warning');

    // 如果最新响应中没有警告，尝试使用上一次有效警告
    if (latestResponse && (!latestResponse.warning || latestResponse.warning.length === 0)) {
        if (lastValidWarning) {
            console.log("Using last valid warning data.");
            latestResponse = lastValidWarning; // 使用上一次有效警告数据
        } else {
            console.log("No valid warning found in cache.");
            // 如果没有有效的警告数据，返回一个提示信息
            return { title: `${location} 当前无天气灾害预警`, description: '当前无可用的天气灾害预警信息。', item: [] };
        }
    }

    // 如果latestResponse仍然未定义，说明首次调用或数据丢失，需要重新从API获取
    if (!latestResponse) {
        const id = await cache.tryGet(ctx.req.param('location') + '_id', async () => {
            const response = await got(`https://geoapi.qweather.com/v2/city/lookup?location=${ctx.req.param('location')}&key=${config.hefeng.key}`);
            const data = [];
            for (const i in response.data.location) {
                data.push(response.data.location[i]);
            }
            return data[0].id;
        });
        const requestUrl = rootUrl + 'key=' + config.hefeng.key + '&location=' + id;
        const response = await got(requestUrl);

        latestResponse = response.data;

        // 根据API响应更新缓存
        if (latestResponse.warning && latestResponse.warning.length > 0) {
            lastValidWarning = latestResponse; // 保存为上一次有效警告
        }
    }

    // 更新缓存
    await cache.set(location + '_latest', latestResponse, CACHE_CONTENT_EXPIRE); // 最新响应
    if (lastValidWarning) {
        await cache.set(location + '_last_valid_warning', lastValidWarning, CACHE_CONTENT_EXPIRE); // 上一次有效警告
    }

    // 构建并返回RSS响应
    const items = latestResponse.warning?.map((item) => ({
        title: item.title,
        description: item.text,
        pubDate: parseDate(item.pubTime), // 假设parseDate是一个处理日期的函数，注意原代码中的pusTime修正为pubTime
        link: latestResponse.fxLink,
    })) || [];

    return {
        title: `${location} 天气灾害预警`,
        description: `${location} 当前的天气灾害预警信息`,
        item: items.length ? items : [{ title: '无预警信息', description: '当前无任何天气灾害预警。' }],
    };
}