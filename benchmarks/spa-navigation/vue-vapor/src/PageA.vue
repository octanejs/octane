<script setup vapor>
import TreeNode from './TreeNode.vue';
import { D } from './state.js';
</script>

<template>
	<div class="page" data-page="a">
		<TreeNode :depth="D" path="a" />
	</div>
</template>
