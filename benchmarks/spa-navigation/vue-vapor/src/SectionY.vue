<script setup vapor>
import TreeNode from './TreeNode.vue';
import { NESTED_D } from './state.js';
</script>

<template>
	<div class="section" data-section="y">
		<TreeNode :depth="NESTED_D" path="y" />
	</div>
</template>
