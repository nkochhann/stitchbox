import { test, suite } from "node:test";
import assert from "node:assert/strict";

// @ts-ignore -- test tsconfig rootDir is restricted to /tests
import { Composer } from './../../src/packages/core/composer/Composer.js';

class DB {
    constructor(private host: string, private port: number){}
    public getHost(): string { return this.host }
}

suite('Edge cases', () => {
    
    test('Empty composer produces an empty container.', () => {
        const container = Composer.create().compose();

        assert.deepStrictEqual({ ...container }, {});
    });

    test('Single-entry composer resolves normally.', () => {
        const container = Composer.create()
            .register({ db: () => new DB('localhost', 1234) })
            .compose();

        assert(container.db instanceof DB && container.db.getHost() === 'localhost');
    });

    test('Current behavior: duplicate keys across successive register() calls, last one wins.', () => {
        const container = Composer.create()
            .register({ db: () => new DB('first-host', 1111) })
            .register({ db: () => new DB('second-host', 2222) })
            .compose();

        assert.strictEqual(container.db.getHost(), 'second-host');
    });

    test('Current behavior: duplicate keys across base and module registrations, module wins.', () => {
        const moduleComposer = Composer.create()
            .register({ db: () => new DB('module-host', 2222) });

        const container = Composer.create()
            .register({ db: () => new DB('base-host', 1111) })
            .registerModule(moduleComposer)
            .compose();

        assert.strictEqual(container.db.getHost(), 'module-host');
    });

    test('Current behavior: when chaining registerModule calls with duplicate keys, rightmost module wins.', () => {
        const moduleA = Composer.create()
            .register({ db: () => new DB('module-a-host', 1111) });
        const moduleB = Composer.create()
            .register({ db: () => new DB('module-b-host', 2222) });

        const container = Composer.create()
            .registerModule(moduleA)
            .registerModule(moduleB)
            .compose();

        assert.strictEqual(container.db.getHost(), 'module-b-host');
    });

    test('Current behavior: registering an empty module does not change the base composer outcome.', () => {
        const baseContainer = Composer.create()
            .register({ db: () => new DB('base-host', 1111) })
            .compose();

        const moduleContainer = Composer.create()
            .register({ db: () => new DB('base-host', 1111) })
            .registerModule(Composer.create())
            .compose();

        assert.strictEqual(baseContainer.db.getHost(), 'base-host');
        assert.strictEqual(moduleContainer.db.getHost(), 'base-host');
    });

    test('Current behavior: a registered key named "toString" resolves the registered factory, not the inherited method.', () => {
        const container = Composer.create()
            // @ts-ignore -- registering a key that collides with an inherited Object member
            .register({ toString: () => 'custom-value' })
            .compose();

        assert.strictEqual(container.toString, 'custom-value');
    });

    test('Current behavior: a registered key named "constructor" resolves the registered factory, not the class constructor.', () => {
        const container = Composer.create()
            // @ts-ignore -- registering a key that collides with an inherited Object member
            .register({ constructor: () => 'custom-value' })
            .compose();

        assert.strictEqual(container.constructor, 'custom-value');
    });

    test('Current behavior: accessing an unregistered symbol property returns undefined; symbol keys are not part of the supported API.', () => {
        const container = Composer.create().compose();
        const sym = Symbol('unregistered');

        // @ts-ignore -- symbol keys are not part of the typed registry API
        assert.strictEqual(container[sym], undefined);
    });

    // TODO: Solve this in composing time. Register objects with circular dependency declarations should not compose.
    test('Current behavior: circular dependencies overflow the call stack rather than producing a descriptive error.', () => {
        const container = Composer.create()
            .register({
                a: ({ b }: any) => b,
                b: ({ a }: any) => a
            } as any)
            .compose();

        assert.throws(() => container.a, RangeError);
    });

    // TODO: Solve this on composing time. Register objects with self-dependency declaration should not compose.
    test('Current behavior: a self-dependency overflows the call stack rather than producing a descriptive error.', () => {
        const container = Composer.create()
            .register({ a: ({ a }: any) => a })
            .compose();

        assert.throws(() => container.a, RangeError);
    });

    test('Current behavior: an invalid registration entry is not validated at register() time, and fails at compose() call.', () => {
        const composer = Composer.create()
            // @ts-ignore -- intentionally registering a malformed entry (not a factory or provider config)
            .register({ db: 'not-a-factory' });

        assert.throws(() => composer.compose(), TypeError);
    });

    test('Current behavior: invalid module entries are not validated at registerModule() time, and fail at compose() call.', () => {
        const invalidModule = Composer.create()
            // @ts-ignore -- intentionally registering a malformed entry (not a factory or provider config)
            .register({ db: 'not-a-factory' });

        const composer = Composer.create().registerModule(invalidModule);

        assert.throws(() => composer.compose(), TypeError);
    });
});