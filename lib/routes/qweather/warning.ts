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

async function handler(ctx) {
    const id = await cache.tryGet(ctx.req.param('location') + '_id', async () => {
        const response = await got(`https://geoapi.qweather.com/v2/city/lookup?location=${ctx.req.param('location')}&key=${config.hefeng.key}`);
        const data = [];
        for (const i in response.data.location) {
            data.push(response.data.location[i]);
        }
        return data[0].id;
    });
    const requestUrl = rootUrl + 'key=' + config.hefeng.key + '&location=' + id;
    const responseData = await cache.tryGet(
        ctx.req.param('location') + '_now',
        async () => {
            const response = await got(requestUrl);
            if (response.data.warning && response.data.warning.length > 0) {
                return response.data;
            } else {
                throw new Error('No new warning data');
            }
        },
        3600,
        false
    ).catch((err) => {
        console.log(err);
        return cache.get(ctx.req.param('location') + '_now');
    });

    const data = responseData.warning;

    const items = data.map((item) => ({
        title: item.title,
        description: item.text,
        pubDate: item.pusTime,
        link: responseData.fxLink,
    }));

    return {
        title:  ctx.req.param('location') + '天气灾害预警',
        description:  ctx.req.param('location') + '天气灾害预警',
        item: items,
    };
}