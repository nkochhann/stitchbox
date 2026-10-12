import { test, suite } from "node:test";
import assert from "node:assert/strict";

// @ts-ignore -- test tsconfig rootDir is restricted to /tests
import { Composer } from './../../src/packages/core/composer/Composer.js';

class ApiClient {
    constructor(private apiKey: string){}
    public getApiKey(): string { return this.apiKey }
}

suite('Hidden providers', () => {
    
    test('A hidden provider can be resolved by another factory.', () => {
        const container = Composer.create()
            .register({ config: { factory: () => ({ apiKey: 'secret' }), hidden: true } })
            .register({ client: ({ config }: any) => new ApiClient(config.apiKey) })
            .compose();

        assert(container.client instanceof ApiClient);
        assert.strictEqual(container.client.getApiKey(), 'secret');
    });

    test('Hidden providers retain transient and singleton behavior.', (t) => {
        const transientFactory = t.mock.fn(() => ({}));
        const singletonFactory = t.mock.fn(() => ({}));

        const container = Composer.create()
            .register({ transientHidden: { factory: transientFactory, hidden: true } })
            .register({ singletonHidden: { factory: singletonFactory, singleton: true, hidden: true } })
            .compose();

        // @ts-expect-error -- hidden from the composed container's public type
        container.transientHidden;
        // @ts-expect-error -- hidden from the composed container's public type
        container.transientHidden;

        // @ts-expect-error -- hidden from the composed container's public type
        container.singletonHidden;
        // @ts-expect-error -- hidden from the composed container's public type
        container.singletonHidden;

        assert.strictEqual(transientFactory.mock.calls.length, 2);
        assert.strictEqual(singletonFactory.mock.calls.length, 1);
    });

    test('Public and hidden providers coexist in one composed container.', () => {
        const container = Composer.create()
            .register({ config: { factory: () => ({ apiKey: 'secret' }), hidden: true } })
            .register({ client: ({ config }) => new ApiClient(config.apiKey) })
            .compose();

        assert(container.client instanceof ApiClient);

        // @ts-expect-error -- `config` is hidden from the composed container's public type
        assert.deepStrictEqual(container.config, { apiKey: 'secret' });
    });

    test('A hidden provider is omitted only from the public API type, not from the runtime proxy.', () => {
        const container = Composer.create()
            .register({ config: { factory: () => ({ apiKey: 'secret' }), hidden: true } })
            .compose();

        assert('config' in container);
        assert.deepStrictEqual(container.config, { apiKey: 'secret' });
    });

    test('A hidden provider from a registered module is injectable into later base registrations.', () => {
        const infraModule = Composer.create()
            .register({ config: { factory: () => ({ apiKey: 'secret' }), hidden: true } });

        const container = Composer.create()
            .registerModule(infraModule)
            .register({ client: ({ config }) => new ApiClient(config.apiKey) })
            .compose();

        assert(container.client instanceof ApiClient);
        assert.strictEqual(container.client.getApiKey(), 'secret');
    });

    test('A hidden provider from a registered module remains hidden from the composed public type.', () => {
        const infraModule = Composer.create()
            .register({ config: { factory: () => ({ apiKey: 'secret' }), hidden: true } });

        const container = Composer.create()
            .registerModule(infraModule)
            .register({ client: ({ config }) => new ApiClient(config.apiKey) })
            .compose();

        assert(container.client instanceof ApiClient);

        // @ts-expect-error -- `config` remains hidden after module merge
        assert.deepStrictEqual(container.config, { apiKey: 'secret' });
    });
});
