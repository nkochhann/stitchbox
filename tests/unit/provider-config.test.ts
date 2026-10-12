import { test, suite } from "node:test";
import assert from "node:assert/strict";

// @ts-ignore -- test tsconfig rootDir is restricted to /tests
import { Composer } from './../../src/packages/core/composer/Composer.js';

class DB {
    constructor(private host: string, private port: number){}
    public getHost(): string { return this.host }
}

suite('Provider configuration', () => {
    
    test('Direct factory registration uses transient behavior by default.', (t) => {
        const factory = t.mock.fn(() => new DB('localhost', 1234));
        const container = Composer.create().register({ db: factory }).compose();

        container.db;
        container.db;

        assert.strictEqual(factory.mock.calls.length, 2);
    });

    test('{ factory, singleton: true } enables singleton behavior without hiding the provider.', (t) => {
        const factory = t.mock.fn(() => new DB('localhost', 1234));
        const container = Composer.create()
            .register({ db: { factory, singleton: true } })
            .compose();

        const first = container.db;
        const second = container.db;

        assert.strictEqual(first, second);
        assert.strictEqual(factory.mock.calls.length, 1);
        assert('db' in container);
    });

    test('{ factory, hidden: true } hides the provider from the public composed type but keeps it available at runtime.', () => {
        const container = Composer.create()
            .register({ db: { factory: () => new DB('localhost', 1234), hidden: true } })
            .compose();

        // @ts-expect-error -- `db` is hidden from the composed container's public type
        const db = container.db;

        assert(db instanceof DB && db.getHost() === "localhost");
    });

    test('{ factory, singleton: true, hidden: true } combines both behaviors.', (t) => {
        const factory = t.mock.fn(() => new DB('localhost', 1234));
        const container = Composer.create()
            .register({ db: { factory, singleton: true, hidden: true } })
            .compose();

        // @ts-expect-error -- `db` is hidden from the composed container's public type
        const first = container.db;
        // @ts-expect-error -- `db` is hidden from the composed container's public type
        const second = container.db;

        assert.strictEqual(first, second);
        assert.strictEqual(factory.mock.calls.length, 1);
    });

    test('Explicit false values are respected independently for singleton and hidden.', (t) => {
        const factory = t.mock.fn(() => new DB('localhost', 1234));
        const container = Composer.create()
            .register({ db: { factory, singleton: false, hidden: false } })
            .compose();

        container.db;
        container.db;

        assert.strictEqual(factory.mock.calls.length, 2);
        assert('db' in container);
    });

    test('Missing optional configuration fields use the documented defaults.', (t) => {
        const factory = t.mock.fn(() => new DB('localhost', 1234));
        const container = Composer.create()
            .register({ db: { factory } })
            .compose();

        container.db;
        container.db;

        // No `singleton`/`hidden` provided -> transient and visible, matching the documented defaults.
        assert.strictEqual(factory.mock.calls.length, 2);
        assert('db' in container);
    });

    test('A singleton provider from a registered module remains singleton in the final container.', (t) => {
        const factory = t.mock.fn(() => new DB('localhost', 1234));

        const persistenceModule = Composer.create()
            .register({ db: { factory, singleton: true } });

        const container = Composer.create()
            .registerModule(persistenceModule)
            .register({ serviceA: ({ db }) => db })
            .register({ serviceB: ({ db }) => db })
            .compose();

        const fromA = container.serviceA;
        const fromB = container.serviceB;
        const direct = container.db;

        assert.strictEqual(fromA, fromB);
        assert.strictEqual(fromA, direct);
        assert.strictEqual(factory.mock.calls.length, 1);
    });
});
