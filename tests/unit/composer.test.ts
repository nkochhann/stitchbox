import { test, suite } from "node:test";
import assert from "node:assert/strict";

// @ts-ignore -- test tsconfig rootDir is restricted to /tests
import { Composer } from './../../src/packages/core/composer/Composer.js';
import { Container } from "../../src/packages/core/container/Container.js";

class DB {
    constructor(private host: string, private port: number){}
    public getHost(): string { return this.host }
}

suite('Builder and composition', () => {

    suite('Composer.create()', () => {
        
        test('Create an empty composer successfully.', () => {
            const composer = Composer.create();

            assert(composer instanceof Composer);
            assert.deepStrictEqual({ ...composer } , { _registerObject: {} });
        });
    })

    suite('Composer.register()', () => {

        test('Register a single direct factory.', () => {
            const factory = () => new DB('localhost', 1234);
            const composer = Composer.create().register({ db: factory });

            assert(composer instanceof Composer);
            assert.deepStrictEqual({ ...composer }, { _registerObject: { db: factory } });
        });

        test('Register multiple entries through chained calls.', () => {
            const factoryA = () => ({ host: "localhost", port: 1234 });
            const factoryB = () => new DB('localhost', 1234);

            const composer = Composer.create().register({ config: factoryA }).register({ db: factoryB });

            assert.deepStrictEqual({ ...composer }, { _registerObject: { config: factoryA, db: factoryB } });
        });

        test('Register a configured provider with factory, singleton, and hidden options.', () => {
            const factory = () => new DB('localhost', 1234);

            const composer = Composer.create().register({
                db: {
                    factory: factory,
                    singleton: true,
                    hidden: true
                }
            });

            assert.deepStrictEqual(
                { ...composer },
                {
                    _registerObject: {
                        db: {
                            factory: factory,
                            singleton: true,
                            hidden: true
                        }
                    }
                }
            );
        })

        test('Verify each call returns a new composer and does not mutate the previous composer.', () => {
            const configFactory = () => ({ host: 'localhost' });
            const dbFactory = () => new DB('localhost', 1234);

            const composerA = Composer.create().register({ config: configFactory });
            const composerB = composerA.register({ db: dbFactory });

            assert.notStrictEqual(composerA, composerB);
            assert.deepStrictEqual({ ...composerA }, { _registerObject: { config: configFactory } });
            assert.deepStrictEqual({ ...composerB }, { _registerObject: { config: configFactory, db: dbFactory } });
        })

        test('Verify registration order is preserved for dependency injection and type inference.', () => {
            const container = Composer.create()
                .register({ config: () => ({ host: 'localhost', port: 1234 }) })
                .register({ db: ({ config }) => new DB(config.host, config.port) })
                .compose();

            assert(container.db instanceof DB);
            assert.strictEqual(container.db.getHost(), 'localhost');
        });

        test('Define and test the behavior when a later registration reuses an earlier key.', () => {
            const firstFactory = () => new DB('first-host', 1111);
            const secondFactory = () => new DB('second-host', 2222);

            const composer = Composer.create()
                .register({ db: firstFactory })
                .register({ db: secondFactory });

            assert.deepStrictEqual({ ...composer }, { _registerObject: { db: secondFactory } });

            const container = composer.compose();

            assert.strictEqual(container.db.getHost(), 'second-host');
        });
    })

    suite('Composer.registerModule()', () => {

        test('Merge registrations from another composer into a new composer.', () => {
            const configFactory = () => ({ host: 'localhost', port: 1234 });
            const dbFactory = ({ config }: any) => new DB(config.host, config.port);

            const moduleComposer = Composer.create()
                .register({ db: dbFactory });

            const composer = Composer.create()
                .register({ config: configFactory })
                .registerModule(moduleComposer);

            const container = composer.compose();

            assert(container.db instanceof DB);
            assert.strictEqual(container.db.getHost(), 'localhost');
        });

        test('Verify registerModule returns a new composer and keeps previous composers immutable.', () => {
            const configFactory = () => ({ host: 'localhost', port: 1234 });
            const dbFactory = ({ config }: any) => new DB(config.host, config.port);

            const baseComposer = Composer.create().register({ config: configFactory });
            const moduleComposer = Composer.create().register({ db: dbFactory });

            const mergedComposer = baseComposer.registerModule(moduleComposer);

            assert.notStrictEqual(baseComposer, mergedComposer);
            assert.deepStrictEqual({ ...baseComposer }, { _registerObject: { config: configFactory } });
            assert.deepStrictEqual({ ...moduleComposer }, { _registerObject: { db: dbFactory } });
            assert.deepStrictEqual(
                { ...mergedComposer },
                { _registerObject: { config: configFactory, db: dbFactory } }
            );
        });

        test('Verify registerModule snapshots module registrations at call time.', () => {
            const configFactory = () => ({ host: 'localhost', port: 1234 });
            const dbFactory = ({ config }: any) => new DB(config.host, config.port);
            const loggerFactory = () => ({ log: (message: string) => message });

            const baseComposer = Composer.create().register({ config: configFactory });
            const moduleComposer = Composer.create().register({ db: dbFactory });

            const mergedComposer = baseComposer.registerModule(moduleComposer);
            const evolvedModuleComposer = moduleComposer.register({ logger: loggerFactory });

            const mergedContainer = mergedComposer.compose();
            const evolvedModuleContainer = evolvedModuleComposer.compose();

            assert(mergedContainer.db instanceof DB);
            // @ts-expect-error -- logger was registered after registerModule snapshot
            assert.strictEqual(mergedContainer.logger, undefined);
            assert.strictEqual(typeof evolvedModuleContainer.logger.log, 'function');
        });

        test('Verify registerModule still composes lazily; factories are not called until read.', (t) => {
            const configFactory = t.mock.fn(() => ({ host: 'localhost', port: 1234 }));
            const dbFactory = t.mock.fn(({ config }: any) => new DB(config.host, config.port));

            const moduleComposer = Composer.create().register({ db: dbFactory });
            const container = Composer.create()
                .register({ config: configFactory })
                .registerModule(moduleComposer)
                .compose();

            assert.strictEqual(configFactory.mock.calls.length, 0);
            assert.strictEqual(dbFactory.mock.calls.length, 0);

            const db = container.db;

            assert(db instanceof DB);
            assert.strictEqual(configFactory.mock.calls.length, 1);
            assert.strictEqual(dbFactory.mock.calls.length, 1);
        });
    })

    suite('Composer.compose()', () => {

        test('Compose an empty composer successfully.', () => {
            const composer = Composer.create();
            const container = composer.compose();

            assert(container instanceof Container);
            assert.deepStrictEqual({ ...container }, {});
        });

        test('Return a working container for direct factories and configured providers.', () => {
            const container = Composer.create()
                .register({ config: () => ({ host: 'localhost' }) })
                .register({
                    db: {
                        factory: () => new DB('new-host', 1234),
                        singleton: false,
                        hidden: false
                    }
                })
                .compose();
                
            assert(container.config instanceof Object && container.config.host === 'localhost');
            assert(container.db instanceof DB && container.db.getHost() === "new-host");
        });

        test('Verify composition creates providers but does not call factories.', (t) => {
            const factory = t.mock.fn(() => new DB('localhost', 1234));

            const container = Composer.create()
                .register({ db: factory })
                .compose();

            assert.strictEqual(factory.mock.calls.length, 0);

            const db = container.db;

            assert.strictEqual(factory.mock.calls.length, 1);
            assert(db instanceof DB);
        });

        test('Verify every registered entry is represented exactly once in the composed container.', (t) => {
            const factoryA = t.mock.fn(() => ({ host: 'localhost', port: 1234 }));
            const factoryB = t.mock.fn(() => new DB('localhost', 1234));

            const container = Composer.create()
                .register({ config: factoryA })
                .register({ db: factoryB })
                .compose();

            assert.strictEqual(factoryA.mock.calls.length, 0);
            assert.strictEqual(factoryB.mock.calls.length, 0);

            const config = container.config;
            const db = container.db;

            assert.strictEqual(factoryA.mock.calls.length, 1);
            assert.strictEqual(factoryB.mock.calls.length, 1);

            assert(config.host === 'localhost' && config.port === 1234);
            assert(db instanceof DB && db.getHost() === 'localhost');
        });

        test('Verify factories are resolved only when their container property is read.', (t) => {
            const factory = t.mock.fn(() => new DB('localhost', 1234));
            
            const container = Composer.create()
                .register({ db: factory })
                .compose();

            assert.strictEqual(factory.mock.calls.length, 0);

            const db1 = container.db;
            assert.strictEqual(factory.mock.calls.length, 1);

            const db2 = container.db;
            assert.strictEqual(factory.mock.calls.length, 2);

            assert(db1 instanceof DB && db2 instanceof DB);
        });
    });
});