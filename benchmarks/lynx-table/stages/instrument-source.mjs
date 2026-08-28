import fs from 'node:fs';
import path from 'node:path';

function replaceOnce(source, search, replacement, file) {
	const first = source.indexOf(search);
	if (first === -1) throw new Error(`stage instrument anchor missing in ${file}.`);
	if (source.indexOf(search, first + search.length) !== -1) {
		throw new Error(`stage instrument anchor is ambiguous in ${file}.`);
	}
	return source.slice(0, first) + replacement + source.slice(first + search.length);
}

export function instrumentLynxStageSources(repositoryRoot) {
	const originals = new Map();
	const update = (relative, transform) => {
		const file = path.join(repositoryRoot, relative);
		const source = fs.readFileSync(file, 'utf8');
		originals.set(file, source);
		fs.writeFileSync(file, transform(source, relative));
	};

	try {
		update('packages/lynx/src/core/profiling.ts', (source, file) => {
			const next = replaceOnce(
				source,
				'\t/** Main: acknowledgement handle computation + dispatch time. */\n\tackMs: number;\n',
				`\t/** Main: acknowledgement handle computation + dispatch time. */
\tackMs: number;
\tbgReplayMs?: number;
\tmtExpandMs?: number;
\tfirstScreenPlanMs?: number;
\tfirstScreenRenderMs?: number;
\tfirstScreenCommandStageMs?: number;
\tfirstScreenContainerMs?: number;
\tfirstScreenPrepareMs?: number;
\tfirstScreenApplyMs?: number;
\tfirstScreenPapiCreateMs?: number;
\tfirstScreenCaptureMs?: number;
\tfirstScreenCommands?: number;
\tfirstScreenHosts?: number;
\tfirstScreenLogicalIds?: number;
\tmtSliceEvalMs?: number;
\tmtSliceStartEpochMs?: number;
\tpapiCreateMs?: number;
`,
				file,
			);
			return replaceOnce(
				next,
				`\tprofile.commands += record.batch?.commands?.length ?? 0;
\tprofile.bytes += encoded.length;
`,
				`\tconst commands = record.batch?.commands ?? [];
\tprofile.commands += commands.length;
\tconst measured = profile as LynxWireProfile & {
\t\ttemplateRuns?: number;
\t\ttemplateInstances?: number;
\t\ttemplateValues?: number;
\t\tpublicHandleCommands?: number;
\t};
\tfor (const rawCommand of commands) {
\t\tconst command = rawCommand as {
\t\t\top?: unknown;
\t\t\tcount?: unknown;
\t\t\tvalues?: readonly unknown[];
\t\t};
\t\tif (command.op === 'mount-template-run') {
\t\t\tmeasured.templateRuns = (measured.templateRuns ?? 0) + 1;
\t\t\tmeasured.templateInstances =
\t\t\t\t(measured.templateInstances ?? 0) +
\t\t\t\t(typeof command.count === 'number' ? command.count : 0);
\t\t\tmeasured.templateValues =
\t\t\t\t(measured.templateValues ?? 0) + (command.values?.length ?? 0);
\t\t} else if (command.op === 'mount-template-range') {
\t\t\tmeasured.templateRuns = (measured.templateRuns ?? 0) + 1;
\t\t\tmeasured.templateInstances = (measured.templateInstances ?? 0) + 1;
\t\t\tmeasured.templateValues =
\t\t\t\t(measured.templateValues ?? 0) + (command.values?.length ?? 0);
\t\t} else if (command.op === 'ensure-public-instance') {
\t\t\tmeasured.publicHandleCommands = (measured.publicHandleCommands ?? 0) + 1;
\t\t}
\t}
\tprofile.bytes += encoded.length;
`,
				file,
			);
		});

		update('packages/lynx/src/core/papi.ts', (source, file) => {
			let next = replaceOnce(
				source,
				'export function createLynxElementPAPI<Node extends LynxElementRef = LynxElementRef>(\n',
				`function profilePapiCreate(started: number): void {
\tconst globals = globalThis as any;
\tconst profile = (globals.__OCTANE_LYNX_PROF ??= {
\t\tcommits: 0,
\t\tpacedCommits: 0,
\t\tcommands: 0,
\t\tbytes: 0,
\t\tselfcheckMs: 0,
\t\tencodeMs: 0,
\t\tdispatchMs: 0,
\t\tdecodeMs: 0,
\t\tvalidateMs: 0,
\t\tprepareMs: 0,
\t\tprepareCheckMs: 0,
\t\tapplyMs: 0,
\t\tackMs: 0,
\t\tdestroyRunExpandMs: 0,
\t\tdenseValidateMs: 0,
\t\teventDetachMs: 0,
\t\tpapiRemoveMs: 0,
\t\tdenseReleaseMs: 0,
\t\tsynthesizedCommands: 0,
\t\teventDetachCount: 0,
\t\tpapiRemoveCount: 0,
\t\tdenseReleaseHostCount: 0,
\t});
\tprofile.papiCreateMs = (profile.papiCreateMs ?? 0) + performance.now() - started;
}

export function createLynxElementPAPI<Node extends LynxElementRef = LynxElementRef>(
`,
				file,
			);
			next = replaceOnce(
				next,
				`\t\t\t\t\t) {
\t\t\t\t\t\treturn createListValue!.call(
\t\t\t\t\t\t\ttarget,
\t\t\t\t\t\t\tparentComponentUniqueId,
\t\t\t\t\t\t\tcomponentAtIndex,
\t\t\t\t\t\t\tenqueueComponent,
\t\t\t\t\t\t\t{},
\t\t\t\t\t\t\tcomponentAtIndexes,
\t\t\t\t\t\t);
\t\t\t\t\t},
`,
				`\t\t\t\t\t) {
\t\t\t\t\t\tconst started = performance.now();
\t\t\t\t\t\ttry {
\t\t\t\t\t\t\treturn createListValue!.call(
\t\t\t\t\t\t\t\ttarget,
\t\t\t\t\t\t\t\tparentComponentUniqueId,
\t\t\t\t\t\t\t\tcomponentAtIndex,
\t\t\t\t\t\t\t\tenqueueComponent,
\t\t\t\t\t\t\t\t{},
\t\t\t\t\t\t\t\tcomponentAtIndexes,
\t\t\t\t\t\t\t);
\t\t\t\t\t\t} finally {
\t\t\t\t\t\t\tprofilePapiCreate(started);
\t\t\t\t\t\t}
\t\t\t\t\t},
`,
				file,
			);
			next = replaceOnce(
				next,
				`\t\tcreatePage(componentId, cssId) {
\t\t\treturn createPage(componentId, cssId);
\t\t},
\t\tcreateElement(type, parentComponentUniqueId, textValue) {
\t\t\tswitch (type) {
`,
				`\t\tcreatePage(componentId, cssId) {
\t\t\tconst started = performance.now();
\t\t\ttry {
\t\t\t\treturn createPage(componentId, cssId);
\t\t\t} finally {
\t\t\t\tprofilePapiCreate(started);
\t\t\t}
\t\t},
\t\tcreateElement(type, parentComponentUniqueId, textValue) {
\t\t\tconst started = performance.now();
\t\t\ttry {
\t\t\t\tswitch (type) {
`,
				file,
			);
			next = replaceOnce(
				next,
				`\t\t\t\tdefault:
\t\t\t\t\treturn createElement(type, parentComponentUniqueId);
\t\t\t}
\t\t},
`,
				`\t\t\t\t\tdefault:
\t\t\t\t\t\treturn createElement(type, parentComponentUniqueId);
\t\t\t\t}
\t\t\t} finally {
\t\t\t\tprofilePapiCreate(started);
\t\t\t}
\t\t},
`,
				file,
			);
			return replaceOnce(
				next,
				`		intrinsics: Object.freeze({
			view: createView,
			text: createText,
			rawText: createRawText,
		}),
`,
				`		intrinsics: Object.freeze({
			view(parentComponentUniqueId) {
				const started = performance.now();
				try {
					return createView(parentComponentUniqueId);
				} finally {
					profilePapiCreate(started);
				}
			},
			text(parentComponentUniqueId) {
				const started = performance.now();
				try {
					return createText(parentComponentUniqueId);
				} finally {
					profilePapiCreate(started);
				}
			},
			rawText(textValue) {
				const started = performance.now();
				try {
					return createRawText(textValue);
				} finally {
					profilePapiCreate(started);
				}
			},
		}),
`,
				file,
			);
		});

		update('packages/lynx/src/main-renderer.ts', (source, file) => {
			let next = replaceOnce(
				source,
				'let CURRENT_ATTEMPT: FirstScreenAttempt | null = null;\n',
				'let CURRENT_ATTEMPT: FirstScreenAttempt | null = null;\nlet FIRST_SCREEN_PLAN_PROFILE_DEPTH = 0;\n',
				file,
			);
			next = replaceOnce(
				next,
				`\t\tassertRenderer(planValue.plan.renderer);
\t\tconst rendered = renderPlanNode(planValue.plan.root, planValue.values);
`,
				`\t\tassertRenderer(planValue.plan.renderer);
\t\tconst outerProfile = FIRST_SCREEN_PLAN_PROFILE_DEPTH === 0;
\t\tconst startedPlan = outerProfile ? performance.now() : 0;
\t\tFIRST_SCREEN_PLAN_PROFILE_DEPTH++;
\t\tlet rendered: FirstScreenNode[];
\t\ttry {
\t\t\trendered = renderPlanNode(planValue.plan.root, planValue.values);
\t\t} finally {
\t\t\tFIRST_SCREEN_PLAN_PROFILE_DEPTH--;
\t\t\tif (outerProfile) {
\t\t\t\tconst globals = globalThis as any;
\t\t\t\tconst profile = (globals.__OCTANE_LYNX_PROF ??= {
\t\t\t\t\tcommits: 0,
\t\t\t\t\tpacedCommits: 0,
\t\t\t\t\tcommands: 0,
\t\t\t\t\tbytes: 0,
\t\t\t\t\tselfcheckMs: 0,
\t\t\t\t\tencodeMs: 0,
\t\t\t\t\tdispatchMs: 0,
\t\t\t\t\tdecodeMs: 0,
\t\t\t\t\tvalidateMs: 0,
\t\t\t\t\tprepareMs: 0,
\t\t\t\t\tprepareCheckMs: 0,
\t\t\t\t\tapplyMs: 0,
\t\t\t\t\tackMs: 0,
\t\t\t\t\tdestroyRunExpandMs: 0,
\t\t\t\t\tdenseValidateMs: 0,
\t\t\t\t\teventDetachMs: 0,
\t\t\t\t\tpapiRemoveMs: 0,
\t\t\t\t\tdenseReleaseMs: 0,
\t\t\t\t\tsynthesizedCommands: 0,
\t\t\t\t\teventDetachCount: 0,
\t\t\t\t\tpapiRemoveCount: 0,
\t\t\t\t\tdenseReleaseHostCount: 0,
\t\t\t\t});
\t\t\t\tprofile.firstScreenPlanMs =
\t\t\t\t\t(profile.firstScreenPlanMs ?? 0) + performance.now() - startedPlan;
\t\t\t}
\t\t}
`,
				file,
			);
			next = replaceOnce(
				next,
				'\tconst templates = selectFirstScreenTemplates(nodes);\n\tconst commands: UniversalHostCommand[] = [];\n',
				`\tconst startedCommandStage = performance.now();
\tconst templates = selectFirstScreenTemplates(nodes);
\tconst commands: UniversalHostCommand[] = [];
`,
				file,
			);
			return replaceOnce(
				next,
				`\treturn Object.freeze({
\t\tbatch: freezeBatch(commands),
\t\thostCount: attempt.hostCount,
\t\tlogicalCount: attempt.nextId - 1,
\t});
`,
				`\tconst batch = freezeBatch(commands);
\tconst commandStageEnded = performance.now();
\tconst globals = globalThis as any;
\tconst profile = (globals.__OCTANE_LYNX_PROF ??= {
\t\tcommits: 0,
\t\tpacedCommits: 0,
\t\tcommands: 0,
\t\tbytes: 0,
\t\tselfcheckMs: 0,
\t\tencodeMs: 0,
\t\tdispatchMs: 0,
\t\tdecodeMs: 0,
\t\tvalidateMs: 0,
\t\tprepareMs: 0,
\t\tprepareCheckMs: 0,
\t\tapplyMs: 0,
\t\tackMs: 0,
\t});
\tprofile.firstScreenCommandStageMs =
\t\t(profile.firstScreenCommandStageMs ?? 0) + commandStageEnded - startedCommandStage;
\treturn Object.freeze({
\t\tbatch,
\t\thostCount: attempt.hostCount,
\t\tlogicalCount: attempt.nextId - 1,
\t});
`,
				file,
			);
		});

		update('packages/lynx/src/main-thread.ts', (source, file) => {
			let next = replaceOnce(
				source,
				'interface LynxMainThreadGlobals {\n',
				'interface LynxMainThreadGlobals {\n\treadonly __OCTANE_LYNX_MT_SLICE_LOAD_START_EPOCH__?: number;\n',
				file,
			);
			next = replaceOnce(
				next,
				`\t\tlet source: LynxHostContainer<Node> | null = null;
\t\ttry {
\t\t\tconst result = renderLynxFirstScreen(component, props);
`,
				`\t\tlet source: LynxHostContainer<Node> | null = null;
\t\ttry {
\t\t\tconst sliceStart = (rawTarget as LynxMainThreadGlobals)
\t\t\t\t.__OCTANE_LYNX_MT_SLICE_LOAD_START_EPOCH__;
\t\t\tif (typeof sliceStart === 'number' && Number.isFinite(sliceStart)) {
\t\t\t\tconst profile = lynxWireProfile();
\t\t\t\tprofile.mtSliceStartEpochMs = sliceStart;
\t\t\t\tprofile.mtSliceEvalMs =
\t\t\t\t\t(profile.mtSliceEvalMs ?? 0) + performance.timeOrigin + performance.now() - sliceStart;
\t\t\t}
\t\t\tconst startedFirstScreenRender = performance.now();
\t\t\tconst result = renderLynxFirstScreen(component, props);
\t\t\tconst firstScreenProfile = lynxWireProfile();
\t\t\tfirstScreenProfile.firstScreenRenderMs =
\t\t\t\t(firstScreenProfile.firstScreenRenderMs ?? 0) +
\t\t\t\tperformance.now() -
\t\t\t\tstartedFirstScreenRender;
\t\t\tfirstScreenProfile.firstScreenCommands = result.batch.commands.length;
\t\t\tfirstScreenProfile.firstScreenHosts = result.hostCount;
\t\t\tfirstScreenProfile.firstScreenLogicalIds = result.logicalCount;
`,
				file,
			);
			next = replaceOnce(
				next,
				`\t\t\tsource = createLynxHostContainer(papi, {
\t\t\t\troot: FIRST_SCREEN_ROOT_ID,
\t\t\t\tpage,
\t\t\t\tworklets: hostWorklets,
\t\t\t});
\t\t\tconst prepared = prepareLynxHostBatch(source, result.batch);
\t\t\tprepared.apply();
`,
				`\t\t\tconst startedFirstScreenContainer = performance.now();
\t\t\tsource = createLynxHostContainer(papi, {
\t\t\t\troot: FIRST_SCREEN_ROOT_ID,
\t\t\t\tpage,
\t\t\t\tworklets: hostWorklets,
\t\t\t});
\t\t\tfirstScreenProfile.firstScreenContainerMs =
\t\t\t\t(firstScreenProfile.firstScreenContainerMs ?? 0) +
\t\t\t\tperformance.now() -
\t\t\t\tstartedFirstScreenContainer;
\t\t\tconst startedFirstScreenPrepare = performance.now();
\t\t\tconst prepared = prepareLynxHostBatch(source, result.batch);
\t\t\tfirstScreenProfile.firstScreenPrepareMs =
\t\t\t\t(firstScreenProfile.firstScreenPrepareMs ?? 0) +
\t\t\t\tperformance.now() -
\t\t\t\tstartedFirstScreenPrepare;
\t\t\tconst papiCreateBeforeApply = firstScreenProfile.papiCreateMs ?? 0;
\t\t\tconst startedFirstScreenApply = performance.now();
\t\t\tprepared.apply();
\t\t\tfirstScreenProfile.firstScreenApplyMs =
\t\t\t\t(firstScreenProfile.firstScreenApplyMs ?? 0) +
\t\t\t\tperformance.now() -
\t\t\t\tstartedFirstScreenApply;
\t\t\tfirstScreenProfile.firstScreenPapiCreateMs =
\t\t\t\t(firstScreenProfile.firstScreenPapiCreateMs ?? 0) +
\t\t\t\t(firstScreenProfile.papiCreateMs ?? 0) -
\t\t\t\tpapiCreateBeforeApply;
`,
				file,
			);
			next = replaceOnce(
				next,
				'\t\t\tconst captured = captureLynxFirstTree(source);\n',
				`\t\t\tconst startedFirstScreenCapture = performance.now();
\t\t\tconst captured = captureLynxFirstTree(source);
\t\t\tfirstScreenProfile.firstScreenCaptureMs =
\t\t\t\t(firstScreenProfile.firstScreenCaptureMs ?? 0) +
\t\t\t\tperformance.now() -
\t\t\t\tstartedFirstScreenCapture;
`,
				file,
			);
			next = replaceOnce(
				next,
				`\t\tlet postFirstTreeIncrementalCompact = false;
`,
				`\t\t// The original stage probe timed legacy instantiate expansion. The
\t\t// template-program transport replaces that step with capability-gated
\t\t// incremental-run validation and freezing; retain the historical profile
\t\t// field name so archived and current samples stay readable together.
\t\tconst startedExpand = performance.now();
\t\tlet postFirstTreeIncrementalCompact = false;
`,
				file,
			);
			return replaceOnce(
				next,
				`\t\tlet record = active;
`,
				`\t\tconst expandProfile = lynxWireProfile();
\t\texpandProfile.mtExpandMs =
\t\t\t(expandProfile.mtExpandMs ?? 0) + performance.now() - startedExpand;

\t\tlet record = active;
`,
				file,
			);
		});

		update('packages/lynx/src/core/transport.ts', (source, file) => {
			let next = replaceOnce(
				source,
				'\tlet pageDestroyHandlerInvoked = false;\n',
				'\tlet pageDestroyHandlerInvoked = false;\n\tlet replayStartedAt: number | null = null;\n',
				file,
			);
			next = replaceOnce(
				next,
				`\t\t\tprofile.selfcheckMs += startedEncode - startedSelfCheck;
\t\t\tprofileOutboundMessage(profile, message, encoded);
\t\t\treturn;
`,
				`\t\t\tprofile.selfcheckMs += startedEncode - startedSelfCheck;
\t\t\tprofileOutboundMessage(profile, message, encoded);
\t\t\tif ((message as { readonly type?: unknown }).type === 'commit' && replayStartedAt !== null) {
\t\t\t\tprofile.bgReplayMs = (profile.bgReplayMs ?? 0) + startedSelfCheck - replayStartedAt;
\t\t\t\treplayStartedAt = null;
\t\t\t}
\t\t\treturn;
`,
				file,
			);
			next = replaceOnce(
				next,
				`\t\tdispatchNativeEventBatch(deliveries) {
\t\t\tif (deliveries.length === 0) return;
\t\t\tif (closedError !== null) {
`,
				`\t\tdispatchNativeEventBatch(deliveries) {
\t\t\tif (deliveries.length === 0) return;
\t\t\tif (replayStartedAt === null) replayStartedAt = performance.now();
\t\t\tif (closedError !== null) {
\t\t\t\treplayStartedAt = null;
`,
				file,
			);
			next = replaceOnce(
				next,
				'\t\t\t\tif (transportRoot !== null && identity.root !== transportRoot) {\n',
				'\t\t\t\tif (transportRoot !== null && identity.root !== transportRoot) {\n\t\t\t\t\treplayStartedAt = null;\n',
				file,
			);
			return replaceOnce(
				next,
				"\t\t\t\tif (identity.priority !== priority) {\n\t\t\t\t\treport(new Error('Octane Lynx native event batch mixes listener priorities.'));\n",
				"\t\t\t\tif (identity.priority !== priority) {\n\t\t\t\t\treplayStartedAt = null;\n\t\t\t\t\treport(new Error('Octane Lynx native event batch mixes listener priorities.'));\n",
				file,
			);
		});
	} catch (error) {
		for (const [file, source] of originals) fs.writeFileSync(file, source);
		throw error;
	}

	return () => {
		for (const [file, source] of originals) fs.writeFileSync(file, source);
	};
}
