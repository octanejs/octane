import { GizmoHelper, useGizmoContext, type GizmoHelperProps } from '@octanejs/drei';

const props: GizmoHelperProps = { alignment: 'bottom-right', margin: [80, 80], renderPriority: 2 };
void props;
void GizmoHelper;
void useGizmoContext;

// @ts-expect-error unknown alignment
const invalid: GizmoHelperProps = { alignment: 'middle' };
void invalid;
