import { DropdownWindow } from '/@/components/Windows/Common/Dropdown/DropdownWindow'
import { App } from '/@/App'
import { ZipDirectory } from '/@/components/FileSystem/Zip/ZipDirectory'
import { saveOrDownload } from '/@/components/FileSystem/saveOrDownload'
import { InformationWindow } from '/@/components/Windows/Common/Information/InformationWindow'
import { isUsingFileSystemPolyfill } from '/@/components/FileSystem/Polyfill'
import { createNotification } from '/@/components/Notifications/create'
import { v4 as uuid } from 'uuid'
import { getLatestFormatVersion } from '../../Data/FormatVersions'

export async function exportAsMctemplate() {
	const app = await App.getApp()
	const project = app.project
	const fs = project.fileSystem
	app.windows.loadingWindow.open()

	await app.project.compilerManager.start('default.json', 'build')

	let baseWorlds: string[] = []

	if (project.hasPacks(['worldTemplate'])) baseWorlds.push('WT')
	if (await fs.directoryExists('worlds'))
		baseWorlds.push(
			...(await fs.readdir('worlds')).map((world) => `worlds/${world}`)
		)

	let exportWorldFolder: string
	// No world to package
	if (baseWorlds.length === 0) {
		app.windows.loadingWindow.close()
		return
	} else if (baseWorlds.length === 1) {
		exportWorldFolder = baseWorlds[0]
	} else {
		const optionsWindow = new DropdownWindow({
			default: baseWorlds[0],
			name: 'windows.packExplorer.exportAsMctemplate.chooseWorld',
			options: baseWorlds,
		})

		exportWorldFolder = await optionsWindow.fired
	}

	await fs.mkdir(`builds/mctemplate/behavior_packs`, {
		recursive: true,
	})
	await fs.mkdir(`builds/mctemplate/resource_packs`, {
		recursive: true,
	})

	// Find out BP, RP & WT folders
	const packs = await fs.readdir('builds/dist')
	const packLocations = <
		{ [pack in 'WT' | 'BP' | 'RP']: string | undefined }
	>Object.fromEntries(
		Object.entries({
			BP: packs.find((pack) => pack.endsWith('BP')),
			RP: packs.find((pack) => pack.endsWith('RP')),
			WT: packs.find((pack) => pack.endsWith('WT')),
		}).map(([pack, packPath]) => [pack, `builds/dist/${packPath}`])
	)

	// Copy world folder into builds/mctemplate
	if (exportWorldFolder === 'WT') {
		await fs.move(packLocations.WT!, `builds/mctemplate`)
	} else {
		await fs.copyFolder(exportWorldFolder, `builds/mctemplate`)
	}

	// Generate world_behavior_packs.json
	if (packLocations.BP) {
		const bpManifest = await fs
			.readJSON(`${packLocations.BP}/manifest.json`)
			.catch(() => null)

		if (
			bpManifest !== null &&
			bpManifest?.header?.uuid &&
			bpManifest?.header?.version
		) {
			await fs.writeJSON('builds/mctemplate/world_behavior_packs.json', [
				{
					pack_id: bpManifest.header.uuid,
					version: bpManifest.header.version,
				},
			])
		}
	}

	// Generate world_resource_packs.json
	if (packLocations.RP) {
		const rpManifest = await fs
			.readJSON(`${packLocations.RP}/manifest.json`)
			.catch(() => null)

		if (
			rpManifest !== null &&
			rpManifest?.header?.uuid &&
			rpManifest?.header?.version
		) {
			await fs.writeJSON('builds/mctemplate/world_resource_packs.json', [
				{
					pack_id: rpManifest.header.uuid,
					version: rpManifest.header.version,
				},
			])
		}
	}

	// Move BP & RP into behavior_packs/resource_packs
	if (packLocations.BP)
		await fs.move(
			packLocations.BP,
			`builds/mctemplate/behavior_packs/BP_${app.project.name}`
		)
	if (packLocations.RP)
		await fs.move(
			packLocations.RP,
			`builds/mctemplate/resource_packs/RP_${app.project.name}`
		)

	// Generate world template manifest if file doesn't exist yet
	if (!(await fs.fileExists('builds/mctemplate/manifest.json'))) {
		await fs.writeJSON('builds/mctemplate/manifest.json', {
			format_version: 2,
			header: {
				name: 'pack.name',
				description: 'pack.description',
				version: [1, 0, 0],
				uuid: uuid(),
				lock_template_options: true,
				base_game_version: (
					app.project.config.get().targetVersion ??
					(await getLatestFormatVersion())
				).split('.'),
			},
			modules: [
				{
					type: 'world_template',
					version: [1, 0, 0],
					uuid: uuid(),
				},
			],
		})
	}

	// ZIP builds/mctemplate folder
	const zipFolder = new ZipDirectory(
		await app.project.fileSystem.getDirectoryHandle('builds/mctemplate', {
			create: true,
		})
	)
	const savePath = `builds/${app.project.name}.mctemplate`

	try {
		await saveOrDownload(
			savePath,
			await zipFolder.package(),
			app.project.fileSystem
		)
	} catch (err) {
		console.error(err)
	}

	let projectName = app.project.name
	if (!isUsingFileSystemPolyfill) {
		const notification = createNotification({
			icon: 'mdi-export',
			color: 'success',
			textColor: 'white',
			message: 'general.successfulExport.title',
			onClick: () => {
				new InformationWindow({
					description: `[${app.locales.translate(
						'general.successfulExport.description'
					)}: "projects/${projectName}/${savePath}"]`,
				})
				notification.dispose()
			},
		})
	}

	// Delete builds/mctemplate folder
	await fs.unlink(`builds/mctemplate`)

	await project.app.windows.loadingWindow.close()
}

export async function canExportMctemplate() {
	const app = await App.getApp()
	return (
		app.project.hasPacks(['worldTemplate']) ||
		((await app.project.fileSystem.directoryExists('worlds')) &&
			(await app.project.fileSystem.readdir('worlds')).length > 0)
	)
}
